const THREE = require('three');
const PLANES = ['yz', 'xz', 'xy']

/** @class OrthoViewer representing a 3-View Nifti Volumic image. */
class OrthoViewer {


    /**
     * Creates an instance of OrthoViewer.
     *
     * @constructor
     * @param {blob} blob object return by a filereader (from local or remote file)
     * @param {function} cb callback called when nifti initialized in worker and mesh created
     */
    constructor(blob, cb) {
        this.worker = new Worker('worker.bundled.js');

        var viewer = this

        this.running = false

        this.worker.onmessage = function(e) {
            var type = e.data.shift();
            var data = e.data.shift();

            if (type == "sliced") {
                var plane = data[0];
                var slice = data[1];
                var imgData = data[2];
                viewer.after_slice(plane, slice, imgData);
            }
            else if (type == "sliced_oriented") {
                var points = data[0];
                var object = data[1];
                viewer.after_slice_oriented(points, object);
                this.running = false
            }
            else if (type == "initialized") {
                viewer.dims = data[0];
                viewer.header = data[1];

                viewer.create_mesh()

                for (var i = 0; i < 3; i++) {
                    viewer.slice(PLANES[i], Math.round((viewer.dims[i]-1)/2))
                }
                cb(viewer);
            }
        }

        this.worker.postMessage(["init", [blob] ]);
    }

    /**
     * Send order to worker to slice {plane} at index {value}
     *
     * @param {string} plane The desired plane to slice
     * @param {integer} value The index of the desired slice
     */
    slice(plane, value){
        this.worker.postMessage(["slice", [plane, value ] ]);
    }

    /**
     * Send order to worker to slice {plane}
     *
     * @param {array} points The Three points to define the plane to slice
     */
     slice_plane(points, distance){
        if (this.running) return

        //Apply mesh matrix to express points in local mesh coordinate (pixels)
        var local_points = points.map(v =>new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(this.mesh.matrix.clone().invert()).toArray())

        console.log("local_points : ", local_points)
        this.worker.postMessage(["slice_plane", [local_points, distance] ]);
    }

    /**
     * Create meshes to represent the volumic image (After loading nifti)
     * and set position according to niftii header
     *
     */
    create_mesh(){
        this.mesh = new THREE.Mesh()

        this.yz = this.createSliceMesh(PLANES[0], this.dims)
        this.xz = this.createSliceMesh(PLANES[1], this.dims)
        this.xy = this.createSliceMesh(PLANES[2], this.dims)

        this.mesh.add(this.yz)
        this.mesh.add(this.xz)
        this.mesh.add(this.xy)

        const axesHelper = new THREE.AxesHelper( 20 );
        this.mesh.add( axesHelper );

        //https://nifti.nimh.nih.gov/nifti-1/documentation/nifti1fields/nifti1fields_pages/qsform.html
        // Warning : Nifti image often respect this standard (sform>0 have priority on qform==0)
        if (this.header.sform_code > 0) { //METHOD 3
            this.mesh.matrixAutoUpdate = false

            this.mesh.matrix.set(
                this.header.affine[0][0], this.header.affine[0][1], this.header.affine[0][2], this.header.affine[0][3],
                this.header.affine[1][0], this.header.affine[1][1], this.header.affine[1][2], this.header.affine[1][3],
                this.header.affine[2][0], this.header.affine[2][1], this.header.affine[2][2], this.header.affine[2][3],
                this.header.affine[3][0], this.header.affine[3][1], this.header.affine[3][2], this.header.affine[3][3]
            )
        }
        else  { //qform_code > 0 : METHOD 2
            this.mesh.scale.set(this.header.pixDims[1], this.header.pixDims[2], this.header.pixDims[3])
        }

        //Add plane mesh
        // var width = Math.floor(Math.pow(this.dims[0]*this.dims[1]*this.dims[2], 1/3));
        var width = Math.max(this.dims[0], this.dims[1], this.dims[2])

        var height = width
        var geometry = new THREE.PlaneBufferGeometry(1, 1);
        var texture = new THREE.DataTexture(new Uint8Array(width * height), width, height, THREE.LuminanceFormat);
        var alpha = new THREE.DataTexture(new Uint8Array(width * height), width, height, THREE.LuminanceFormat);
        var material = new THREE.MeshBasicMaterial({map:texture, alphaMap:alpha, transparent:true, side:THREE.DoubleSide});
        this.plane_mesh = new THREE.Mesh(geometry, material);
        this.plane_mesh.visible = false

        this.mesh.add(this.plane_mesh)
    }

    /**
     * Called after slicing to update texture and position
     *
     * @param {string} plane The desired plane to slice
     * @param {integer} value The index of the desired slice
     * @param {ArrayBuffer} imgData The slice image data
     */
    after_slice(plane, value, imgData){
        let mesh = this[plane]
        let texture = mesh.material.map

        texture.image.data = imgData;
        texture.needsUpdate = true

        let index = PLANES.indexOf(plane)

        mesh.position.setComponent(index, parseInt(value)+0.5)
    }

    /**
     * Called after custom slicing to update texture and position
     *
     * @param {array} points The 3 points used to define the plane (unused)
     * @param {object} object The object return by slice_oriented_plane in niftiSlicer
     */

    after_slice_oriented(points, object) {
        const v = object.vertices
        var vertices =  this.plane_mesh.geometry.attributes.position;
        //update vertices positions
        for (var i=0 ; i<4 ; i++) {
            vertices.setXYZ( i, v[3*i+0], v[3*i+1], v[3*i+2] );
        }

        vertices.needsUpdate = true;

        //update plane appearance
        let texture = this.plane_mesh.material

        texture.map.image.width = object.width
        texture.map.image.height = object.width
        texture.map.image.data = object.texture;
        texture.alphaMap.image.width = object.width
        texture.alphaMap.image.height = object.width
        texture.alphaMap.image.data = object.alpha;

        //update mesh
        texture.map.needsUpdate = true
        texture.alphaMap.needsUpdate = true
        this.plane_mesh.geometry.computeFaceNormals();
        this.plane_mesh.geometry.computeVertexNormals();
        this.plane_mesh.geometry.computeBoundingSphere();
        this.plane_mesh.visible = true


        // //debug
        // for (var point of object.inter_points) {
        //     const pointLight = new THREE.PointLight( 0xff7700, 1, 100 );
        //     pointLight.position.set(point[0], point[1], point[2])
        //     const pointLightHelper = new THREE.PointLightHelper( pointLight, 3 );
        //     this.mesh.add( pointLightHelper );
        // }

        // //debug
        // for (var point of object.vertices) {
        //     const pointLight = new THREE.PointLight( 0x3377ff, 1, 100 );
        //     pointLight.position.set(point[0], point[1], point[2])
        //     const pointLightHelper = new THREE.PointLightHelper( pointLight, 3 );
        //     this.mesh.add( pointLightHelper );
        // }

    }

    /**
     * Create one plane of the viewer
     *
     * @param {string} plane The desired plane to slice
     *
     * @return {THREE.Mesh} The generate mesh (plane)
    */
    createSliceMesh(plane){
        var geometry = new THREE.PlaneBufferGeometry(1, 1);

        var coord, width, height;

        //Generate plane (Rectangle) vertices coordonnate
        //   with respect to chosen plane and Nifti header
        var vertices = geometry.attributes.position;
        if (plane == "xy") {
            coord = [0,          this.dims[1],    0,
                    this.dims[0],    this.dims[1],    0,
                    0,          0,          0,
                    this.dims[0],    0,          0];
            width = this.dims[0];
            height = this.dims[1];
        } else if (plane == "xz") {
            coord = [0,          0,          this.dims[2],
                    this.dims[0],    0,          this.dims[2],
                    0,          0,          0,
                    this.dims[0],    0,          0,     ];
            width = this.dims[0];
            height = this.dims[2];
        } else if (plane == "yz") {
            coord = [0,          0,          this.dims[2],
                    0,          this.dims[1],    this.dims[2],
                    0,          0,          0,
                    0,          this.dims[1],    0,    ];

            width = this.dims[1];
            height = this.dims[2];
        }

        for ( var i = 0; i < 4; i++ ) {
            vertices.setXYZ( i, coord[3*i], coord[3*i+1], coord[3*i+2] );
        }

        var texture = new THREE.DataTexture(new Uint8Array(width * height), width, height, THREE.LuminanceFormat);
        geometry.computeFaceNormals();
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        var material = new THREE.MeshBasicMaterial({map:texture});
        material.side = THREE.DoubleSide;
        var mesh = new THREE.Mesh(geometry, material);

        return mesh
    }
}

exports.OrthoViewer = OrthoViewer;
