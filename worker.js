const NiftiSlicer = require('./niftiSlicer.js').NiftiSlicer

var slicer;

//Message manager between the main script and NiftiSlicer


/*
* MAIN                                                 WORKER
*
# At begining
*          ------------------ init ------------------> NiftiSlicer.constructor
*          <-------------- initialized ---------------
*
*
# Request for a slice
*          ------------------ slice ------------------> NiftiSlicer.slice
*          <---------------- sliced -------------------
*
*
*/



self.addEventListener('message', function(e) {
    var message = e.data[0];
    var data = e.data[1];

    if (message == 'init') {
        slicer = new NiftiSlicer(data[0], data[1])
        postMessage(["initialized", [slicer.dims, slicer.header] ]);
    }
    else if (message == 'slice') {
        var t0 = performance.now();
        array = slicer.slice(data[0], data[1]);
        var t1 = performance.now();
        console.log("slice " + (t1 - t0) + " millisecondes.")

        postMessage(["sliced", [data[0], data[1], array] ], [array.buffer]);
    }
    else if (message == 'slice_plane') {
        var t0 = performance.now();
        array = slicer.slice_oriented_plane(data[0], data[1]);
        var t1 = performance.now();
        console.log("slice_oriented_plane " + (t1 - t0) + " millisecondes.")

        postMessage(["sliced_oriented", [data[0], array] ], [array.alpha.buffer, array.texture.buffer]);
    }
  }, false);