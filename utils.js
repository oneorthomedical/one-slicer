const m = require("mathjs")
const THREE = require('three');

/**
 * Compute plane parameters (a, b, c, d) from ax+by+cz+d=0 from three 3D-points
 *
 * @param {array} A The first point defining the plane
 *
 * @param {array} B The second point defining the plane
 *
 * @param {array} C The third point defining the plane
 *
 * @return {array} the plane parameters : a, b, c, d
 */
function plane_from_points(A, B, C) {

    var AB = m.subtract(B, A)
    var AC = m.subtract(C, A)

    AB = m.divide(AB, m.norm(AB))
    AC = m.divide(AC, m.norm(AC))

    var n = m.cross(AB, AC)
    //plane normal
    n = m.divide(n, m.norm(n))

    //distance to the origin
    d = - m.dot(A, n)

    return [n[0], n[1], n[2], d]
}

/**
 * Compute the interesection between a plane and edges of a box, considering a box of between (0, 0, 0)
 * and (width, height, depth)
 *
 * @param {array} dims The three dimensions of the box (width, height, depth)
 *
 * @param {array} P The plane parameters
 *
 * @return {list} A list of interesect points
 */
function get_inter_points(dims, P) {
    var points = [];
    var x, y, z;

    // x-parrallel
    for (y of [0, dims[1]]) {
        for (z of [0, dims[2]]) {
            if (P[0] != 0) {
                x = -(P[1] * y + P[2] * z + P[3]) / P[0];
                if (x >= 0 && x <= dims[0])
                {
                    points.push([x, y, z]);
                }
            }
        }
    }

    // y-parrallel
    for (x of [0, dims[0]]) {
        for (z of [0, dims[2]]) {
            if (P[0] != 0) {
                y = -(P[0] * x + P[2] * z + P[3])/P[1];
                if (y >= 0 && y <= dims[1])
                {
                    points.push([x, y, z]);
                }
            }
        }
    }

    // z-parrallel
    for (x of [0, dims[0]]) {
        for (y of [0, dims[1]]) {
            if (P[0] != 0) {
                z = -(P[0] * x + P[1] * y + P[3])/P[2];
                if (z >= 0 && z <= dims[2])
                {
                    points.push([x, y, z]);
                }
            }
        }
    }

    return points

}

/**
 * Compute the 2D minimal bbox contains a list of 2D-points
 *
 * @param {array} points An array of 2-D points
 *
 * @return {object} A bounding-box defined by its minimal points and its maximal points
 */
function bbox2(points) {
    var x_min = 10e10, x_max = -10e10;
    var y_min = 10e10, y_max = -10e10;

    for (p of points) {
        x_min = Math.min(x_min, p[0]);
        x_max = Math.max(x_max, p[0]);
        y_min = Math.min(y_min, p[1]);
        y_max = Math.max(y_max, p[1]);
    }

    return {
        "min": [x_min, y_min],
        "max": [x_max, y_max]
    }
}

/**
 * Matrix-Vector multiply for the Size-3 case
 *
 * @param {array} m The 3x3 Matrix
 *
 * @param {array} v The 3x1 Vector
 *
 * @return {array} A 3x1 Vector
 */
function multiply(m, v) {
    return [
        v[0]*m[0] + v[1]*m[1] + v[2]*m[2],
        v[0]*m[3] + v[1]*m[4] + v[2]*m[5],
        v[0]*m[6] + v[1]*m[7] + v[2]*m[8]
    ]
}
function createPlane(points) {
    const plane = new THREE.Plane();
    plane.setFromCoplanarPoints(points.a, points.b, points.c);
    const helper = new THREE.PlaneHelper(plane, 100, 0xff0000);
    helper.updateMatrixWorld(true);
    const geometry = new THREE.PlaneGeometry(300, 300, 32);
    const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
    });
    const planeMesh = new THREE.Mesh(geometry, material);
    planeMesh.name = 'plan';
    planeMesh.position.copy(points.a);
    planeMesh.rotation.copy(helper.rotation);
    return planeMesh;
}

exports.plane_from_points = plane_from_points
exports.get_inter_points = get_inter_points
exports.bbox2 = bbox2
exports.multiply = multiply
exports.createPlane = createPlane
