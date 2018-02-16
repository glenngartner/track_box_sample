/// <reference types="@argonjs/argon" />
/// <reference types="three"/>
/// <reference types="dat-gui"/>

// set up Argon
const app = Argon.init();

// set up THREE.  Create a scene, a perspective camera and an object
// for the gvuBrochure target.  Do not add the gvuBrochure target content to the scene yet
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const gvuBrochureObject = new THREE.Object3D();
scene.add(camera);

// variable for the dat.GUI() instance
var gui;

// create an object to put the head in, which is then added to the object attached to the 
// gvuBrochure target
const headModel = new THREE.Object3D();
gvuBrochureObject.add(headModel);

// We use the standard WebGLRenderer when we only need WebGL-based content
const renderer = new THREE.WebGLRenderer({ 
    alpha: true, 
    logarithmicDepthBuffer: true,
    antialias: Argon.suggestedWebGLContextAntialiasAttribute
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.bottom = '0';
renderer.domElement.style.left = '0';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
app.view.element.appendChild(renderer.domElement);

// our HUD renderer for 2D screen-fixed content.  This deals with stereo viewing in argon
const hud = new (<any>THREE).CSS3DArgonHUD();
// var description = document.getElementById( 'description' );
// hud.hudElements[0].appendChild(description);
app.view.element.appendChild(hud.domElement);

// This application is based on the Decals demo for three.js.  We had to change
// it to deal with the fact that the content is NOT attached to the origin of 
// the scene.  In the original demo, all content was added to the scene, and 
// many of the computations assumed the head was positioned at the origin of 
// the world with the identity orientation. 

// variables for the application 
var mesh: THREE.Mesh, decal;
var line;

var intersection = {
    intersects: false,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3()
};

var mouse = new THREE.Vector2();

var textureLoader = new THREE.TextureLoader();
var decalDiffuse = textureLoader.load( '../resources/textures/decal/decal-diffuse.png' );
var decalNormal = textureLoader.load( '../resources/textures/decal/decal-normal.jpg' );

var decalMaterial = new THREE.MeshPhongMaterial( {
    specular: 0x444444,
    map: decalDiffuse,
    normalMap: decalNormal,
    normalScale: new THREE.Vector2( 1, 1 ),
    shininess: 30,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: - 4,
    wireframe: false
} );

var decals = [];
var p = new THREE.Vector3( 0, 0, 0 );
var r = new THREE.Vector3( 0, 0, 0 );
var s = new THREE.Vector3( 10, 10, 10 );
var up = new THREE.Vector3( 0, 1, 0 );
var check = new THREE.Vector3( 1, 1, 1 );

var params = {
    projection: 'normal',
    minScale: 10,
    maxScale: 20,
    rotate: true,
    clear: function() {
        removeDecals();
    }
};

scene.add( new THREE.AmbientLight( 0x443333 ) );

var light = new THREE.DirectionalLight( 0xffddcc, 1 );
light.position.set( 1, 0.75, 0.5 );
scene.add( light );

var light = new THREE.DirectionalLight( 0xccccff, 1 );
light.position.set( -1, 0.75, -0.5 );
scene.add( light );

var geometry = new THREE.Geometry();
geometry.vertices.push( new THREE.Vector3(), new THREE.Vector3() );

// add to the headModel node, not the scene
line = new THREE.Line( geometry, new THREE.LineBasicMaterial( { linewidth: 4 } ) );
headModel.add( line );

// leave mouseHelper in the scene, since it will get positioned/oriented in world coordinates
var raycaster = new THREE.Raycaster();
var mouseHelper = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 10 ), new THREE.MeshNormalMaterial() );
mouseHelper.visible = false;
scene.add( mouseHelper );

window.addEventListener( 'load', init );

function init() {
    loadLeePerrySmith();

    // Support both mouse and touch.
    renderer.domElement.addEventListener( 'mouseup', function(event:MouseEvent) {
        var x = event.clientX;
        var y = event.clientY;
        mouse.x = ( x / window.innerWidth ) * 2 - 1;
        mouse.y = - ( y / window.innerHeight ) * 2 + 1;
        
        checkIntersection();
        if (intersection.intersects )  shoot();
    });

    renderer.domElement.addEventListener( 'touchstart', function (event:TouchEvent) {
		var x = event.changedTouches[ 0 ].pageX;
        var y = event.changedTouches[ 0 ].pageY;
        mouse.x = ( x / window.innerWidth ) * 2 - 1;
        mouse.y = - ( y / window.innerHeight ) * 2 + 1;
        // prevent touches from emiting mouse events 
        event.preventDefault();
    }, false );

    renderer.domElement.addEventListener( 'touchend', function(event:TouchEvent) {
		var x = event.changedTouches[ 0 ].pageX;
        var y = event.changedTouches[ 0 ].pageY;
        mouse.x = ( x / window.innerWidth ) * 2 - 1;
        mouse.y = - ( y / window.innerHeight ) * 2 + 1;

        // only do touches in mono mode
        if (monoMode) {
            checkIntersection();
            if (intersection.intersects ) requestAnimationFrame(shoot);
        }

        // prevent touches from emiting mouse events
        event.preventDefault();
    } );

    renderer.domElement.addEventListener( 'touchmove', onTouchMove );
    renderer.domElement.addEventListener( 'mousemove', onTouchMove );

    function onTouchMove( event:TouchEvent|MouseEvent ) {
        var x,y: number;
        if ( event.type == "touchmove" ) {
            x = (event as TouchEvent).changedTouches[ 0 ].pageX;
            y = (event as TouchEvent).changedTouches[ 0 ].pageY;

        } else {

            x = (event as MouseEvent).clientX;
            y = (event as MouseEvent).clientY;

        }

        mouse.x = ( x / window.innerWidth ) * 2 - 1;
        mouse.y = - ( y / window.innerHeight ) * 2 + 1;

        // only do touches in mono mode
        if (monoMode) {
            checkIntersection();
        }

        event.preventDefault();
    }

    // add dat.GUI to the left HUD.  We hid it in stereo viewing, so we don't need to 
    // figure out how to duplicate it.
    gui = new dat.GUI({ autoPlace: false });
    hud.hudElements[0].appendChild(gui.domElement);

    gui.add( params, 'projection', { 'From cam to mesh': 'camera', 'Normal to mesh': 'normal' } );
    gui.add( params, 'minScale', 1, 30 );
    gui.add( params, 'maxScale', 1, 30 );
    gui.add( params, 'rotate' );
    gui.add( params, 'clear' );
    gui.open();
}

// a temporary variable to hold the world inverse matrix.  Used to move values between
// scene (world) coordinates and the headModel coordinates, to make this demo work 
// when the head is not attached to the world
var invWorld = new THREE.Matrix4();

function checkIntersection() {

    if ( ! mesh ) return;

    // make sure everything is updated
    scene.updateMatrixWorld(true);

    raycaster.setFromCamera( mouse, camera );

    var intersects = raycaster.intersectObjects( [ mesh ] );

    if ( intersects.length > 0 ) {
        // get the transform from the world object back to the root of the scene
        invWorld.getInverse( headModel.matrixWorld );

        // need to move the point into "world" object instead of global scene coordinates

        var p = intersects[ 0 ].point;
        mouseHelper.position.copy( p );
        intersection.point.copy( p );

        var n = intersects[ 0 ].face.normal.clone();
        // the normal is in mesh coords, need it to be in world coords
        n.transformDirection(mesh.matrixWorld);

        intersection.normal.copy( intersects[ 0 ].face.normal );
        
        n.multiplyScalar( .010 );
        n.add( intersects[ 0 ].point );

        mouseHelper.lookAt( n );

        line.geometry.vertices[ 0 ].copy( intersection.point );
        line.geometry.vertices[ 1 ].copy( n );

        // move line coordinates to the headModel object coordinates, from the world
        line.geometry.vertices[0].applyMatrix4(invWorld);
        line.geometry.vertices[1].applyMatrix4(invWorld);

        line.geometry.verticesNeedUpdate = true;
        intersection.intersects = true;

    } else {

        intersection.intersects = false;

    }

}


function loadLeePerrySmith() {

    // var loader = new THREE.JSONLoader();

    // loader.load( '../resources/obj/leeperrysmith/LeePerrySmith.js', function( geometry ) {

        // var material = new THREE.MeshStandardMaterial( {
        //     color: 0xaa0000,
        //     roughness: .25,
        //     metalness: 0
        // });

        //     new THREE.MeshPhongMaterial( {
        //     specular: 0x111111,
        //     map: textureLoader.load( '../resources/obj/leeperrysmith/Map-COL.jpg' ),
        //     specularMap: textureLoader.load( '../resources/obj/leeperrysmith/Map-SPEC.jpg' ),
        //     normalMap: textureLoader.load( '../resources/obj/leeperrysmith/Infinite-Level_02_Tangent_SmoothUV.jpg' ),
        //     normalScale: new THREE.Vector2( 0.75, 0.75 ),
        //     shininess: 25
        // } );

        var geometry = new THREE.BoxGeometry(1, 1, 1);

        var material = new THREE.MeshStandardMaterial( {
            color: 0xaa0000,
            roughness: .25,
            metalness: 0
        });
        mesh = new THREE.Mesh( geometry, material );

        mesh.position.set(0, .0375, -.07);

        // add the model to the headModel object, not the scene
        headModel.add( mesh );
        mesh.scale.set( .02, .02, .02 );
        mesh.rotation.x = THREE.Math.degToRad(90);
    // } );
}

function shoot() {
    
    if ( params.projection == 'camera' ) {

        var dir = headModel.getWorldPosition();
        var camPos = camera.getWorldPosition();
        dir.sub( camPos );

        p = intersection.point;

        var m = new THREE.Matrix4();
        var c = dir.clone();
        c.negate();
        c.multiplyScalar( 10 );
        c.add( p );
        m.lookAt( p, c, up );

        // put the rotation in headModel object coordinates
        m.multiplyMatrices(invWorld, m);
        m = m.extractRotation( m );

        var dummy = new THREE.Object3D();
        dummy.rotation.setFromRotationMatrix( m );
        r.set( dummy.rotation.x, dummy.rotation.y, dummy.rotation.z );

    } else {
        p = intersection.point;

        var m = new THREE.Matrix4();
        // get the mouseHelper orientation in headModel coordinates
        m.multiplyMatrices(invWorld, mouseHelper.matrixWorld);

        var dummy = new THREE.Object3D();
        dummy.rotation.setFromRotationMatrix( m );
        r.set( dummy.rotation.x, dummy.rotation.y, dummy.rotation.z );
    }

    // move p to headModel object coordinates from world
    p = p.clone();
    p.applyMatrix4(invWorld);

    var scale = (params.minScale + Math.random() * ( params.maxScale - params.minScale ))/500.0;
    s.set( scale, scale, scale );

    if ( params.rotate ) r.z = Math.random() * 2 * Math.PI;

    var material = decalMaterial.clone();
    material.color.setHex( Math.random() * 0xffffff );

    // mesh is in headModel coordinates, to p & r have also been moved into headModel coords
    var m2 = new THREE.Mesh( new (<any>THREE).DecalGeometry( mesh, p, r, s, false ), material );
    decals.push( m2 );
    headModel.add( m2 );
}

function removeDecals() {

    decals.forEach( function( d ) {

        headModel.remove( d );
        d = null;

    } );
    decals = [];

}

function mergeDecals() {

    var merge = {};
    decals.forEach( function ( decal ) {

        var uuid = decal.material.uuid;
        var d = merge[ uuid ] = merge[ uuid ] || {};
        d.material = d.material || decal.material;
        d.geometry = d.geometry || new THREE.Geometry();
        d.geometry.merge( decal.geometry, decal.matrix );

    } );

    removeDecals();

    for ( var key in merge ) {

        var d = merge[ key ];
        var mesh = new THREE.Mesh( d.geometry, d.material );
        headModel.add( mesh );
        decals.push( mesh );

    }

}

// tell argon to initialize vuforia for our app, using our license information.
app.vuforia.init({
    encryptedLicenseData:
`-----BEGIN PGP MESSAGE-----
Version: OpenPGP.js v2.3.2
Comment: http://openpgpjs.org

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
+HrS+veTetqlRkQ=
=JVnV
-----END PGP MESSAGE-----
`
}).then((api)=>{
    // the vuforia API is ready, so we can start using it.

    // tell argon to download a vuforia dataset.  The .xml and .dat file must be together
    // in the web directory, even though we just provide the .xml file url here 
    api.objectTracker.createDataSet("getting_started_database/getting_started_database.xml").then( (dataSet)=>{
        // the data set has been succesfully downloaded
        console.log('Created DataSet ' + dataSet.id)

        // tell vuforia to load the dataset.  
        dataSet.load().then(()=>{
            console.log('Loaded DataSet ' + dataSet.id)

            // when it is loaded, we retrieve a list of trackables defined in the
            // dataset and set up the content for the target
            const trackables = dataSet.getTrackables();

            console.log('Trackables: ' + Object.keys(trackables))
            
            // tell argon we want to track a specific trackable.  Each trackable
            // has a Cesium entity associated with it, and is expressed in a 
            // coordinate frame relative to the camera.  Because they are Cesium
            // entities, we can ask for their pose in any coordinate frame we know
            // about.
            const gvuBrochureEntity = app.context.subscribeToEntityById(trackables['scan_EW_front'].id)
            
            // the updateEvent is called each time the 3D world should be
            // rendered, before the renderEvent.  The state of your application
            // should be updated here.
            app.context.updateEvent.addEventListener(() => {
                // get the pose (in local coordinates) of the gvuBrochure target
                const gvuBrochurePose = app.context.getEntityPose(gvuBrochureEntity);

                // if the pose is known the target is visible, so set the
                // THREE object to it's location and orientation
                if (gvuBrochurePose.poseStatus & Argon.PoseStatus.KNOWN) {
                    gvuBrochureObject.position.copy(<any>gvuBrochurePose.position);
                    gvuBrochureObject.quaternion.copy(<any>gvuBrochurePose.orientation);
                }
                
                // when the target is first seen after not being seen, the 
                // status is FOUND.  Add the gvuBrochureObject content to the target.
                // when the target is first lost after being seen, the status 
                // is LOST.  Here, we remove the gvuBrochureObject, removing all the
                // content attached to the target from the world.
                if (gvuBrochurePose.poseStatus & Argon.PoseStatus.FOUND) {
                    scene.add (gvuBrochureObject);
                    headModel.position.set(0,0,.08);
                } else if (gvuBrochurePose.poseStatus & Argon.PoseStatus.LOST) {
                    scene.remove (gvuBrochureObject);
                }
                
            })
        });
        
        // activate the dataset.
        api.objectTracker.activateDataSet(dataSet);
    });
}).catch(()=>{
    // if we're not running in Argon, we'll position the headModel in front of the camera
    // in the world, so we see something and can test
    if (app.session.isRealityManager) {
        app.context.updateEvent.addEventListener(() => {
            const userPose = app.context.getEntityPose(app.context.user);

            if (userPose.poseStatus & Argon.PoseStatus.KNOWN) {
                headModel.position.copy(<any>userPose.position);
                headModel.quaternion.copy(<any>userPose.orientation);
                headModel.translateZ(-0.5);
                headModel.rotateX(-Math.PI/2);
            }
            
            if (userPose.poseStatus & Argon.PoseStatus.FOUND) {
                scene.add (headModel);
            }
        })
    }
})

// make a note of if we're in mono or stereo mode, for use in the touch callbacks
var monoMode = false;

// renderEvent is fired whenever argon wants the app to update its display
app.renderEvent.addEventListener(() => {
    // if we have 1 subView, we're in mono mode.  If more, stereo.
    monoMode = (app.view.subviews).length == 1;

    // set the renderer to know the current size of the viewport.
    // This is the full size of the viewport, which would include
    // both views if we are in stereo viewing mode
    const view = app.view;
    renderer.setSize(view.renderWidth, view.renderHeight, false);    
    renderer.setPixelRatio(app.suggestedPixelRatio);

    const viewport = view.viewport;
    hud.setSize(viewport.width, viewport.height);

    for (let subview of app.view.subviews) {
        // set the position and orientation of the camera for 
        // this subview
        camera.position.copy(<any>subview.pose.position);
        camera.quaternion.copy(<any>subview.pose.orientation);
        // the underlying system provide a full projection matrix
        // for the camera. 
        camera.projectionMatrix.fromArray(<any>subview.frustum.projectionMatrix);

        // set the viewport for this view
        var {x,y,width,height} = subview.renderViewport;
        renderer.setViewport(x,y,width,height);

        // set the webGL rendering parameters and render this view
        renderer.setScissor(x,y,width,height);
        renderer.setScissorTest(true);
        renderer.render(scene, camera);

        if (monoMode) {
            // adjust the hud, but only in mono mode. 
            var {x,y,width,height} = subview.viewport;
            hud.setViewport(x,y,width,height, subview.index);
            hud.render(subview.index);
        }
    }
})