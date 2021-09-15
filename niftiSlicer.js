
const nifti = require('nifti-reader-js')
const utils = require('./utils.js')
const m = require("mathjs")

/** @class NiftiSlicer representing a Volumic image with method to load and slice (workerized) */
class NiftiSlicer {

    /**
     * Creates an instance of NiftiSlicer.
     *
     * @constructor
     * @param {blob} data object return by a filereader (from local or remote file)
     */
    constructor(data) {

        // parse nifti
        if (nifti.isCompressed(data)) {
            data = nifti.decompress(data);
        }

        if (!nifti.isNIFTI(data))
            return

        this.header = nifti.readHeader(data);
        this.image = nifti.readImage(this.header, data);

        this.affine = this.header.affine
        this.dims = this.header.dims.slice(1)

        // convert raw data to typed array based on nifti datatype
        if (this.header.datatypeCode === nifti.NIFTI1.TYPE_UINT8) {
            this.typedData = new Uint8Array(this.image);
        } else if (this.header.datatypeCode === nifti.NIFTI1.TYPE_INT16) {
            this.typedData = new Int16Array(this.image);
        } else if (this.header.datatypeCode === nifti.NIFTI1.TYPE_INT32) {
            this.typedData = new Int32Array(this.image);
        } else if (this.header.datatypeCode === nifti.NIFTI1.TYPE_FLOAT32) {
            this.typedData = new Float32Array(this.image);
        } else if (this.header.datatypeCode === nifti.NIFTI1.TYPE_FLOAT64) {
            this.typedData = new Float64Array(this.image);
        } else if (this.header.datatypeCode === nifti.NIFTI1.TYPE_INT8) {
            this.typedData = new Int8Array(this.image);
        } else if (this.header.datatypeCode === nifti.NIFTI1.TYPE_UINT16) {
            this.typedData = new Uint16Array(this.image);
        } else if (this.header.datatypeCode === nifti.NIFTI1.TYPE_UINT32) {
            this.typedData = new Uint32Array(this.image);
        }

        this.preCompute()
    }

    /**
     * Precompute 3D array with normalized data and right array type
     *
     */
    preCompute() {
        // Compute min/max value
        var len = this.typedData.length, min = Infinity, max=-Infinity;

        while (len--) {
            if (this.typedData[len] < min) {
                min = this.typedData[len];
            }
            if (this.typedData[len] > max) {
                max = this.typedData[len];
            }
        }

        this.preComp = new Uint8Array(this.typedData.length)

        len = this.typedData.length

        //normalize data to display
        while (len--) {
            this.preComp[len] = (this.typedData[len] - min)* 255 / (max - min)
        }

    }

    /**
     * Send order to worker to slice {plane} at index {value}
     *
     * @param {integer} col The col (x) of the desired index
     * @param {integer} row The row (y) of the desired index
     * @param {integer} slice The slice (z) of the desired index
     *
     * @return {integer} the linearized value
     */
    ind2sub(col, row, slice) {
        return this.dims[0]*this.dims[1]*slice + this.dims[0]*row + col
    }

    /**
     * Generate slice (2D image) from the 3D image
     *
     * @param {string} plane The desired plane to slice
     * @param {integer} slice The slice index
     * @param {integer} slice The slice (z) of the desired index
     *
     * @return {Uint8Array} the image data array
     */
    slice(plane, slice) {

        slice = parseInt(slice)

        if (plane == "yz") {
            var cols = this.dims[1];
            var rows = this.dims[2];
        } else if (plane == "xz") {
            var cols = this.dims[0];
            var rows = this.dims[2];
        } else if (plane == "xy") {
            var cols = this.dims[0];
            var rows = this.dims[1];
        }


        let offset;

        var output_array = new Uint8Array(cols * rows)

        // draw pixels
        for (var row = 0; row < rows; row++) {
            for (var col = 0; col < cols; col++) {
                if (plane == "yz") {
                    offset = this.ind2sub(slice, col, row)
                } else if (plane == "xz") {
                    offset = this.ind2sub(col, slice, row)
                } else if (plane == "xy") {
                    offset = this.ind2sub(col, row, slice)
                }

                output_array[row*cols+col] = this.preComp[offset]
            }
        }

        return output_array
    }


    /**
     * Generate slice (2D image) from the 3D image
     *
     * @param {string} points The three points defining the plane
     * Those points are defined in image pixel-coordinate
     *
     * @return {object} the image data array
     */
    slice_oriented_plane(points, distance) {
        const A = points[0], B = points[1], C = points[2]

        // compute the plane eq. from the three points
        var plane = utils.plane_from_points(A, B, C)

        //offset plane by the desired distance
        plane[3] = plane[3] + distance

        //Use a local coordinate system : where
        // - axis X belong to vector AB
        // - axis Z belong to the plane normal
        // - axis Y computed from X and Z to create a direct orthonomal coordinate system
        var AB = m.subtract(B, A)
        AB = m.divide(AB, m.norm(AB))
        var n = plane.slice(0, 3)

        //Compute rotation matrix between local and global coordinate system
        var R = m.matrix([AB, m.cross(n, AB), n])
        var dist_orig_plane = -plane[3]

        //Compute plane limit polygone
        var inter_points = utils.get_inter_points(this.dims, plane)
        //Compute 2D BBox from this poly
        var p_2D = inter_points.map(p => m.multiply(R, p)._data.slice(0, 2));
        var bbox = utils.bbox2(p_2D)

        var Rt = m.transpose(R)

        var bbox_points = [
            [bbox.min[0], bbox.max[1]],
            [bbox.max[0], bbox.max[1]],
            [bbox.min[0], bbox.min[1]],
            [bbox.max[0], bbox.min[1]]
        ]

        var bbox_width = bbox.max[0] - bbox.min[0]
        var bbox_height = bbox.max[1] - bbox.min[1]

        //Compute 3D position of the bounding box
        var vertices = []
        for (var point of bbox_points) {
            point.push(dist_orig_plane)
            var p = m.multiply(Rt, point)._data
            vertices.push(p[0], p[1], p[2])
        }

        // Sampling resolution (arbritrary set to max of original image)
        var width = Math.max(this.dims[0], this.dims[1], this.dims[2])
        var height = width

        //Image buffer data to display image
        var texture = new Uint8Array(width * height);
        var alpha = new Uint8Array(width * height);


        var Rt_flat = Rt._data.flat()

        for (var x = 0 ; x < width ; x++) {
            for (var y = 0 ; y < height ; y++) {
                //(x,y) correspond to 2D-coordinate on the plane (in the local system)

                //3D point in local system
                var p = [
                    (x+0.5) / width * bbox_width + bbox.min[0],
                    (y+0.5) / height * bbox_height + bbox.min[1],
                    dist_orig_plane
                ]

                //3D-point in the global system
                p = utils.multiply(Rt_flat, p);
                //p = m.multiply(Rt, p)._data //slow matrix multiplication

                //Check if pixel in the range of the image
                if (p.every(v=>v>0) &&  p.every((v, i)=>v<this.dims[i])) {
                    //alpha = True to display this pixel
                    alpha[y*width+x] = 255

                    //linear index in the image volume
                    var offset = this.ind2sub(Math.round(p[0]), Math.round(p[1]), Math.round(p[2]))
                    //nearest sampling
                    texture[y*width+x] = this.preComp[offset]
                }
                else
                    //transparent pixel
                    alpha[y*width+x] = 0
            }
        }

        return {
            vertices:vertices,
            alpha:alpha,
            texture:texture,
            width:width,
            // //debug data
            // inter_points:inter_points,
            // bbox_points:bbox_points,
            // distance:distance,
            // dist_orig_plane:dist_orig_plane

        }
    }
}

exports.NiftiSlicer = NiftiSlicer;
