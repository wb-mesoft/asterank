(function() {
  "use strict";

  window.requestAnimFrame = (function(){
    return  window.requestAnimationFrame       ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            window.oRequestAnimationFrame      ||
            window.msRequestAnimationFrame     ||
            function( callback ){
              window.setTimeout(callback, 1000 / 60);
            };
  })();


  var WEB_GL_ENABLED = true;
  var MAX_NUM_ORBITS = 10000;
  var stats, scene, renderer, composer;
  var camera, cameraControls;
  var pi = Math.PI;
  var using_webgl = false;
  var camera_fly_around = false;
  var object_movement_on = true;
  var lastHovered;
  var added_objects = [];
  var planets = [];
  var planet_orbits_visible = true;
  var jed = 2451545.0;
  var particle_system_geometry = null;
  var asteroids_loaded = false;

  // workers stuff
  var works = [];
  var workers = [];
  var NUM_WORKERS = 1;
  var worker_path = '/3d/js/position_worker.js';
  var workers_initialized = false;

  if(!init())	animate();
  initGUI();

  $('#btn-toggle-movement').on('click', function() {
    object_movement_on = !object_movement_on;
  });
  $('#controls .js-sort').on('click', function() {
    runAsteroidQuery($(this).data('sort'));
    $('#controls .js-sort').css('font-weight', 'normal');
    $(this).css('font-weight', 'bold');
  });

  function initGUI() {
    var ViewUI = function() {
      this['Cost effective'] = function() {
        runAsteroidQuery('score');
      };
      this['Most valuable'] = function() {
        runAsteroidQuery('price');
      };
      this['Most accessible'] = function() {
        runAsteroidQuery('closeness');
      };
      this.movement = object_movement_on;
      this['planet orbits'] = planet_orbits_visible;
    };

    window.onload = function() {
      var text = new ViewUI();
      var gui = new dat.GUI();
      gui.add(text, 'Cost effective');
      gui.add(text, 'Most valuable');
      gui.add(text, 'Most accessible');
      gui.add(text, 'movement').onChange(function() {
        object_movement_on = !object_movement_on;
      });
      gui.add(text, 'planet orbits').onChange(function() {
        togglePlanetOrbits();
      });
    };
  }

  function togglePlanetOrbits() {
    if (planet_orbits_visible) {
      for (var i=0; i < planets.length; i++) {
        scene.remove(planets[i].getEllipse());
      }
    }
    else {
      for (var i=0; i < planets.length; i++) {
        scene.add(planets[i].getEllipse());
      }
    }
    planet_orbits_visible = !planet_orbits_visible;
  }

  // init the scene
  function init(){
    if(WEB_GL_ENABLED && Detector.webgl){
      renderer = new THREE.WebGLRenderer({
        antialias		: true,	// to get smoother output
        //preserveDrawingBuffer	: true	// to allow screenshot
      });
      renderer.setClearColorHex(0x000000, 1);
      using_webgl = true;
    }
    else{
      renderer	= new THREE.CanvasRenderer();
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('container').appendChild(renderer.domElement);

    // Set up stats
    /*
    stats = new Stats();
    stats.domElement.style.position	= 'absolute';
    stats.domElement.style.bottom	= '0px';
    document.body.appendChild(stats.domElement);
    */

    // create a scene
    scene = new THREE.Scene();

    // put a camera in the scene
    var cameraH	= 3;
    var cameraW	= cameraH / window.innerHeight * window.innerWidth;
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 5000);
    camera.position.set(22.39102192510384, -124.78460848134833, -55.29382439584528);


    window.cam = camera;
    THREE.Object3D._threexDomEvent.camera(camera);    // camera mouse handler
    THREEx.WindowResize(renderer, camera);    // handle window resize

    scene.add(camera);

    cameraControls	= new THREE.TrackballControlsX(camera)
    cameraControls.staticMoving = true;
    cameraControls.panSpeed = 2;
    cameraControls.zoomSpeed = 3;
    cameraControls.maxDistance = 1100;

    // Rendering stuff

    // "sun" - 0,0 marker
    (function() {

      if (using_webgl) {
        /*
           var geometry= new THREE.SphereGeometry(1);
           var material= new THREE.MeshBasicMaterial({color: 0xffee00});
           var mesh = new THREE.Mesh(geometry, material);
           scene.add(mesh);
           */
        var sun = new THREE.Object3D();
        var texture = THREE.ImageUtils.loadTexture("/images/sunsprite.png");
        var sprite = new THREE.Sprite({
          map: texture,
            useScreenCoordinates: false,
            color: 0xffffff
        });
        sprite.scale.x = .1;
        sprite.scale.y = .1;
        sprite.scale.z = .1;
        sprite.color.setHSV(1.0, 0.0, 1.0);
        sprite.blending = THREE.AdditiveBlending;
        sun.add(sprite);
        scene.add(sun);
      }
      else {
        var material = new THREE.ParticleBasicMaterial({
          map: new THREE.Texture( starTexture(0xfff2a1,1) ),
          blending: THREE.AdditiveBlending
        });
        var particle = new THREE.Particle(material);
        particle.isClickable = false;
        scene.add(particle);
      }
    })();

    /*
    var plane = new THREE.Mesh(new THREE.PlaneGeometry(75, 75), new THREE.MeshBasicMaterial({
        color: 0x0000ff
    }));
    plane.overdraw = true;
    plane.doubleSided = true;
    plane.rotation.x = pi/2;
    scene.add(plane);
    */

    // Ellipses
    runAsteroidQuery();
    var mercury = new Orbit3D(Ephemeris.mercury,
        {color: 0x913CEE, width: 1, jed: jed});
    scene.add(mercury.getEllipse());
    scene.add(mercury.getParticle());
    var venus = new Orbit3D(Ephemeris.venus,
        {color: 0xFF7733, width: 1, jed: jed});
    scene.add(venus.getEllipse());
    scene.add(venus.getParticle());
    var earth = new Orbit3D(Ephemeris.earth,
        {color: 0x009ACD, width: 1, jed: jed});
    scene.add(earth.getEllipse());
    scene.add(earth.getParticle());
    var mars = new Orbit3D(Ephemeris.mars,
        {color: 0xA63A3A, width: 1, jed: jed});
    scene.add(mars.getEllipse());
    scene.add(mars.getParticle());
    var jupiter = new Orbit3D(Ephemeris.jupiter,
        {color: 0xFF7F50, width: 1, jed: jed});
    scene.add(jupiter.getEllipse());
    scene.add(jupiter.getParticle());

    planets.push.apply(planets, [mercury, venus, earth, mars, jupiter]);

    // Sky
    if (using_webgl) {
      var materialArray = [];
      materialArray.push(new THREE.MeshBasicMaterial( { map: THREE.ImageUtils.loadTexture( '/images/universe.jpg' ) }));
      materialArray.push(new THREE.MeshBasicMaterial( { map: THREE.ImageUtils.loadTexture( '/images/universe.jpg' ) }));
      materialArray.push(new THREE.MeshBasicMaterial( { map: THREE.ImageUtils.loadTexture( '/images/universe.jpg' ) }));
      materialArray.push(new THREE.MeshBasicMaterial( { map: THREE.ImageUtils.loadTexture( '/images/universe.jpg' ) }));
      materialArray.push(new THREE.MeshBasicMaterial( { map: THREE.ImageUtils.loadTexture( '/images/universe.jpg' ) }));
      materialArray.push(new THREE.MeshBasicMaterial( { map: THREE.ImageUtils.loadTexture( '/images/universe.jpg' ) }));
      var skyboxGeom = new THREE.CubeGeometry(5000, 5000, 5000, 1, 1, 1, materialArray);
      var skybox = new THREE.Mesh( skyboxGeom, new THREE.MeshFaceMaterial() );
      skybox.flipSided = true;
      scene.add(skybox);
    }

    $('#container').on('mousedown', function() {
      camera_fly_around = false;
    });
  }

  // animation loop
  function animate() {
    if (camera_fly_around) {
      var timer = 0.0001 * Date.now();
      cam.position.x = Math.cos( timer ) * 50;
      //cam.position.y = Math.sin( timer ) * 100;
      cam.position.z = -100 + Math.sin( timer ) * 40;
    }
    if (object_movement_on) {
    /*
    jed += .5;
    for (var i=0; i < planets.length; i++) {
      planets[i].MoveParticle(jed);
    }
    */

    /*
    for (var i=0; i < added_objects.length; i++) {
      added_objects[i].MoveParticle(jed);
    }
    */

    if (jed >= 2451910.25) {
      jed = 2451545.0;
    }
    /*
    if (particle_system_geometry) {
      particle_system_geometry.__dirtyVertices = true;
    }
    */
    }
    render();
    requestAnimFrame(animate);
  }

  // render the scene
  function render() {
    // update camera controls
    cameraControls.update();

    // actually render the scene
    renderer.render(scene, camera);
  }

  function startSimulation() {
    if (!asteroids_loaded) {
      throw "couldn't start simulation: asteroids not loaded";
    }
    if (!workers_initialized) {
      throw "couldn't start simulation: simulation not initialized";
    }

    for (var i=0; i < workers.length; i++) {
      // trigger work
      var particles = works[i];
      var obj_ephs = [];
      for (var j=0; j < particles.length; j++) {
        obj_ephs.push(particles[j].eph);
      }
      workers[i].postMessage({
        particle_ephemeris: obj_ephs,
        start_jed: jed
      });
    }
  }

  function initSimulation() {
    var l = added_objects.length;
    var objects_per_worker = Math.ceil(l / NUM_WORKERS);
    var remainder = l % NUM_WORKERS;
    for (var i=0; i < NUM_WORKERS; i++) {
      workers[i] = new Worker(worker_path);
      var start = i*objects_per_worker;
      works[i] = added_objects.slice(start, Math.min(start + objects_per_worker, l));
    }
    // TODO synchronization, and don't need to call for each jed - the workers should do that themselves

    for (var i=0; i < NUM_WORKERS; i++) {
      (function() {
        var worker_index = i;
        workers[worker_index].onmessage = function(e) {
          handleSimulationResults(e, worker_index);
        }
      })();
    }
    workers_initialized = true;
  }

  function handleSimulationResults(e, worker_index) {
    var data = e.data;
    switch(data.type) {
      case 'result':
        var positions = data.value.positions;
        var particles = works[worker_index];
        for (var j=0; j < positions.length; j++) {
          particles[j].MoveParticleToPosition(positions[j]);
        }
        particle_system_geometry.__dirtyVertices = true;
        break;
      case 'debug':
        console.log(data.value);
        break;
      default:
        console.log('Invalid data type', data.type);
    }
  }

  function runAsteroidQuery(sort) {
    sort = sort || 'score';
    $('#loading').show();

    // Remove any old setup
    for (var i=0; i < added_objects.length; i++) {
      scene.remove(added_objects[i].getParticle());
    }
    if (lastHovered) scene.remove(lastHovered);

    // Get new data points
    $.getJSON('/top?sort=' + sort + '&n=' + MAX_NUM_ORBITS + '&use3d=true', function(data) {
      if (!data.results) {
        alert('Sorry, something went wrong and the server failed to return data.');
        return;
      }
      var n = data.results.rankings.length;
      added_objects = [];
      particle_system_geometry = new THREE.Geometry();

      for (var i=0; i < n; i++) {
        var roid = data.results.rankings[i];
        var orbit = new Orbit3D(roid, {
          color: 0xffffff,
          width:2,
          object_size: 0.75,
          jed: jed,
          particle_geometry: particle_system_geometry
        }, scene);
        /*
        (function(roid, orbit, i) {
          orbit.getParticle().on('mouseover', function(e) {
            if (lastHovered) scene.remove(lastHovered);
            lastHovered = orbit.getEllipse();
            scene.add(lastHovered);
            $('#main-caption').html(roid.full_name + ' - $' + roid.fuzzed_price + ' in potential value');
            $('#other-caption').html('(ranked #' + (i+1) + ')');
          });
        })(roid, orbit, i);
        */
        //scene.add(orbit.getParticle());
        added_objects.push(orbit);
      }

      // done loading
      var particle_system_material = new THREE.ParticleBasicMaterial({
          color: 0xffffff,
          size: 1
        });
      var particleSystem = new THREE.ParticleSystem(
        particle_system_geometry,
        particle_system_material
      );

      // add it to the scene
      particleSystem.sortParticles = true;
      particleSystem.frustumCulled = true;
      scene.add(particleSystem);
      asteroids_loaded = true;

      console.log('Starting with', NUM_WORKERS, 'worker');
      initSimulation();
      startSimulation();

      $('#loading').hide();
    });
  }

  function starTexture(color, size) {
    var size = (size) ? parseInt(size*24) : 24;
    var canvas = document.createElement( 'canvas' );
    canvas.width = size;
    canvas.height = size;
    var col = new THREE.Color(color);

    var context = canvas.getContext( '2d' );
    var gradient = context.createRadialGradient( canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width / 2 );
    var rgbaString = 'rgba(' + ~~ ( col.r * 255 ) + ',' + ~~ ( col.g * 255 ) + ',' + ~~ ( col.b * 255 ) + ',' + (1) + ')';
    gradient.addColorStop( 0, rgbaString);
    gradient.addColorStop( 0.1, rgbaString);
    gradient.addColorStop( 0.6, 'rgba(125, 20, 0, 0.2)' );
    gradient.addColorStop( .92, 'rgba(0,0,0,0)' );
    context.fillStyle = gradient;
    context.fillRect( 0, 0, canvas.width, canvas.height );
    return canvas;
  }
})();

if (!window.console) window.console = {log: function() {}};
