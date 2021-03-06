(function( window, $ ) {
  var $window, $doc;

  $window = $(window);
  $doc = $( document.documentElement );

  window.componentNamespace = window.componentNamespace || window;

  Function.prototype.bind = function( context ) {
    var self = this;

    return function() {
      self.apply( context, arguments );
    };
  };

  var Tau = window.componentNamespace.Tau = function( element ) {
    var startIndex, reducedStepSize;

    this.element = element;
    this.$element = $( element );
    this.$initial = this.$element.find( "img" );
    this.$loading = this.$element.find( ".loading" );
    this.index = 0;

    // grab the user specified step size for when the browser is less-abled
    reducedStepSize = parseInt( this.$initial.attr("data-reduced-step-size"), 10 ) || 4;

    // TODO sort out a better qualification for the full set of images?
    this.stepSize = window.requestAnimationFrame ? 1 : reducedStepSize;

    this.frames = parseInt( this.$initial.attr("data-frames"), 10 );

    // grab the user specified auto start delay
    this.autoRotateStartDelay =
      parseInt( this.$initial.attr("data-auto-rotate-delay"), 10 ) || Tau.autoRotateStartDelay;

    this.mouseMoveBinding = this.rotateEvent.bind(this);
    this.touchMoveBinding = this.rotateEvent.bind(this);

    this.path = new Tau.Path();

    // make sure the initial image stays visible after enhance
    this.$initial.addClass( "focused" );

    // hide all other images
    this.$element.addClass( "tau-enhanced" );

    // create a rendering spot to force decoding in IE and prevent blinking
    //
    this.$render = $( "<div data-render class=\"render\"></div>" )
      .css( "position", "absolute" )
      .css( "left", "0" )
      .css( "top", "0" )
      .prependTo( this.element );

    // create the rest of the images
    this.createImages();

    // set the initial index and image
    this.goto( 0 );

    // start the automatic rotation
    setTimeout(this.autoRotate.bind(this), this.autoRotateStartDelay);

    // setup the event bindings for touch drag and mouse drag rotation
    this.bind();
  };

  Tau.autoRotateDelay = 64;
  Tau.autoRotateStartDelay = 100;
  Tau.verticalScrollRatio = 4;
  Tau.decelTimeStep = Tau.autoRotateDelay / 2;
  Tau.decel = Tau.decelTimeStep / 8;
  Tau.maxVelocity = 60;

  Tau.prototype.change = function( delta ) {
    this.goto( this.index + delta );
  };

  Tau.prototype.goto = function( index ) {
    var $next, normalizedIndex, imageCount = this.$images.length;

    index = index % imageCount;

    // stay within the bounds of the array
    normalizedIndex = (imageCount + index) % imageCount;

    // set the next image that's going to be shown/focused
    $next = this.$images.eq( normalizedIndex );

    // skip this action if the desired image isn't loaded yet
    // TODO do something fancier here instead of just throwing up hands
    if( !$next[0].tauImageLoaded ) {
      this.showLoading();
      return;
    }

    // record the updated index only after advancing is possible
    this.index = normalizedIndex;

    // hide the old focused image
    if( this.$current ) {
      this.$current.removeClass( "focused" );
    }

    // record the current focused image and make it visible
    this.$current = $next;

    // show the new focused image
    this.$current.addClass( "focused" );
  };

  // TODO transplant the attributes from the initial image
  Tau.prototype.createImages = function() {
    var src, frames, html, $new, boundImageLoaded;

    // avoid doing rebinding in a tight loop
    boundImageLoaded = this.imageLoaded.bind( this );

    src = this.$initial.attr( "data-src-template" );

    // mark the initial image as loaded
    this.markImageLoaded( this.$initial[0] );

    for( var i = this.stepSize + 1; i <= this.frames; i+= this.stepSize ) {
      html = "<img src=" + src.replace("$FRAME", i) + "></img>";

      $new = $( html );

      // record when each image has loaded
      $new.bind( "load", boundImageLoaded );

      this.$element.append( $new );
      this.$render.append( html );
    }

    this.$images = this.$element.children().filter( "img" );
    this.loadedCount = 0;
  };

  Tau.prototype.imageLoaded = function( event ) {
    this.markImageLoaded( event.target );
    this.loadedCount++;

    if( this.loadedCount >= this.frames - 1) {
      this.hideLoading();
    }
  };

  Tau.prototype.markImageLoaded = function( element ) {
    element.tauImageLoaded = true;
  };

  Tau.prototype.bind = function() {
    this.$element.bind( "mousedown touchstart", this.track.bind(this) );
  };

  Tau.prototype.autoRotate = function() {
    if( this.autoInterval ) {
      return;
    }

    this.autoInterval = setInterval(function() {
      this.change( 1 );
    }.bind(this), Tau.autoRotateDelay * this.stepSize);
  };

  Tau.prototype.stopAutoRotate = function() {
    clearInterval( this.autoInterval );
    this.autoInterval = undefined;
  };

  Tau.prototype.track = function( event ) {
    var point;

    // prevent dragging behavior for mousedown
    if( event.type === "mousedown"  ){
      event.preventDefault();
    }

    if( this.tracking ) {
      return;
    }

    $doc.one( "mouseup", this.release.bind(this) );
    $doc.one( "touchend", this.release.bind(this) );

    this.tracking = true;

    // clean out the path since we'll need a new one for decel
    this.path.reset();

    // show the cursor as grabbing
    this.cursorGrab();

    // calculate/store how many pixels makes for an image switch
    this.rotateThreshold = $doc[0].clientWidth / this.frames;

    // record the x for threshold calculations
    point = this.getPoint( event );
    this.downX = point.x;
    this.downY = point.y;
    this.downIndex = this.index;

    $doc.bind( "mousemove", this.mouseMoveBinding );
    $doc.bind( "touchmove", this.touchMoveBinding );
  };

  Tau.prototype.slow = function() {
    // if the path gets broken during the decel just stop
    if( !this.path.isSufficient() ) {
      this.clearSlowInterval();
      return;
    }

    this.rotate({
      x: this.path.last().x + this.velocity,
      y: this.path.last().y
    });

    if( this.velocity > 0 ){
      this.velocity = this.velocity - Tau.decel;

      if( this.velocity <= 0 ){
        this.clearSlowInterval();
      }
    } else {
      this.velocity = this.velocity + Tau.decel;

      if( this.velocity >= 0 ){
        this.clearSlowInterval();
      }
    }
  };

  Tau.prototype.clearSlowInterval = function() {
    clearInterval(this.slowInterval);
    this.velocity = 0;
    this.slowInterval = undefined;
  };

  Tau.prototype.decel = function() {
    var velocity, sign;

    // if we don't have two points of mouse or touch tracking this won't work
    if( !this.path.isSufficient() ) {
      return;
    }

    // determine the starting velocity based on the traced path
    velocity = this.path.velocity( Tau.decelTimeStep );

    // borrowed from http://stackoverflow.com/questions/7624920/number-sign-in-javascript
    sign = velocity > 0 ? 1 : velocity < 0 ? -1 : 0;

    // keep a lid on how fast the rotation spins out
    if( Math.abs(velocity) > Tau.maxVelocity ){
      velocity = sign * Tau.maxVelocity;
    }

    this.velocity = velocity;
    this.slowInterval = setInterval(this.slow.bind(this), Tau.decelTimeStep);
  };

  Tau.prototype.release = function( event ) {
    this.decel();

    this.cursorRelease();

    // TODO sort out why shoestring borks when unbinding with a string split list
    $doc.unbind( "mousemove", this.mouseMoveBinding );
    $doc.unbind( "touchmove", this.touchMoveBinding );

    this.tracking = false;
  };

  Tau.prototype.cursorGrab = function() {
    $doc.addClass( "grabbing" );
  };

  Tau.prototype.cursorRelease = function() {
    $doc.removeClass( "grabbing" );
  };

  Tau.prototype.showLoading = function() {
    this.$loading.attr( "style" , "display: block" );
  };

  Tau.prototype.hideLoading = function() {
    this.$loading.attr( "style" , "display: none" );
  };

  Tau.prototype.getPoint = function( event ) {
    var touch = event.touches || (event.originalEvent && event.originalEvent.touches);

    if( touch ){
      return {
        x: touch[0].pageX,
        y: touch[0].pageY
      };
    }

    return {
      x: event.pageX || event.clientX,
      y: event.pageY || event.clientY
    };
  };

  Tau.prototype.rotateEvent = function( event ) {
    // NOTE it might be better to prevent when the rotation returns anything BUT false
    //      so that slow drags still get the scroll prevented
    if( this.rotate(this.getPoint(event)) ){
      event.preventDefault();
    }
  };

  Tau.prototype.rotate = function( point ) {
    var deltaX, deltaY;

    deltaX = point.x - this.downX;
    deltaY = point.y - this.downY;

    // if the movement on the Y dominates X then skip and allow scroll
    if( Math.abs(deltaY) / Math.abs(deltaX) >= Tau.verticalScrollRatio ) {
      return false;
    }

    // NOTE works better on mousedown, here allows autorotate to continue
    this.stopAutoRotate();

    // since we're rotating record the point for decel
    this.path.record( point );

    // NOTE to reverse the spin direction add the delta/thresh to the downIndex
    if( Math.abs(deltaX) >= this.rotateThreshold ) {
      this.goto( this.downIndex - Math.round(deltaX / this.rotateThreshold) );
      return true;
    }
  };
})(this, jQuery);
