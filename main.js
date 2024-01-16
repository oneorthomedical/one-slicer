const THREE = require('three');
const OrbitControls = require('three-orbitcontrols')
var STLLoader = require('three-stl-loader')(THREE)

const OrthoViewer = require('./orthoViewer.js').OrthoViewer
const utils = require('./utils.js')
const m = require("mathjs")

const PLANES = ['yz', 'xz', 'xy']

/////////////////////////
//// SCENE MANAGMENT ////
/////////////////////////
const scene = new THREE.Scene();
scene.background = new THREE.Color("white");
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer();
const controls = new OrbitControls(camera, renderer.domElement);

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.z = 1000;

function addGeometry(geometry) {
    var material = new THREE.MeshNormalMaterial()
    material.transparent = true
    material.opacity = 0.5
    var mesh = new THREE.Mesh(geometry, material)
    stlmesh.add(mesh)
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();

var stlmesh = new THREE.Mesh()

stlmesh.rotateY(-Math.PI)
scene.add(stlmesh)

var loader = new STLLoader()

//////////////////////////
//// VIEWER MANAGMENT ////
//////////////////////////

var viewer;

function generateReader() {
    var reader = new FileReader();

    reader.onloadend = function (evt) {
        if (evt.target.readyState === FileReader.DONE) {
            viewer = new OrthoViewer(evt.target.result, function (v) {

                // Add viewer into a independant mesh to adjust it position
                // OrthoViewer worldMatrix is changed to match Nifti header
                mesh = new THREE.Mesh()
                mesh.add(v.mesh)
                mesh.rotateX(-Math.PI / 2)
                mesh.position.set(7, -648, -121);
                scene.add(mesh);
                scene.add(new THREE.AxesHelper(500));

                renderer.render(scene, camera);

                for (var i = 0; i < 3; i++) {
                    let plane = PLANES[i];

                    let slider = document.getElementById(plane);
                    let slices = v.dims[i];
                    slider.max = slices - 1;
                    slider.value = Math.round(slices / 2);

                    slider.oninput = function () {
                        v.slice(plane, slider.value);
                    };
                }

                //An example of points to define the plane
                // Those points are defined in image pixel-coordinate
                const points = {
                    a: new THREE.Vector3(50, 30, 10),
                    b: new THREE.Vector3(10, 10, 10),
                    c: new THREE.Vector3(20, 10, 20),
                }

                let A = points.a.toArray();
                let B = points.b.toArray();
                let C = points.c.toArray();

                const sphere = new THREE.Mesh(new THREE.SphereBufferGeometry(5, 30), new THREE.MeshNormalMaterial());
                for (const value of Object.values(points)) {
                    let s = sphere.clone();
                    s.position.copy(value);
                    scene.add(s);
                }
                const planeMesh = utils.createPlane(points);
                scene.add(planeMesh);
                v.slice_plane([A, B, C], 0)
                //Custom axis
                let custom_slider = document.getElementById("custom");
                custom_slider.oninput = function () {
                    v.slice_plane([A, B, C], parseFloat(custom_slider.value))
                };


            });

            loader.load('./pelvis.stl', addGeometry)
            loader.load('./femur_right.stl', addGeometry)
            loader.load('./femur_left.stl', addGeometry)
        }
    };
    return reader
}

var request = new XMLHttpRequest();
var url = "S102.nii";
//url = "avg152T1_RL_nifti.nii"

request.open('GET', url, true);

request.responseType = 'blob';

request.onload = function () {
    var handler = generateReader();
    handler.readAsArrayBuffer(request.response);
};

request.send();
