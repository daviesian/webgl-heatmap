
var Earth = {
	radius: 6378137,
    circum: 6378137 * 2.0 * Math.PI,
    halfCirc: 6378137 * Math.PI,
};

function LatLongPos(lat, lon)
{
	this.lat = lat;
	this.lon = lon
	
	this.toPixelCoords = function()
	{
		return [longitudeToX(this.lon), latitudeToY(this.lat)];
	}
}

function latitudeToY(lat)
{
	var arc = Earth.circum / 256;// / ((1 << zoomLevel) * 256);
	var sinLat = Math.sin((lat * Math.PI / 180));
	var metersY = Earth.radius / 2 * Math.log((1 + sinLat) / (1 - sinLat));
	var y = (Earth.halfCirc - metersY) / arc;
	return y;
}

function longitudeToX(lon)
{
	var arc = Earth.circum / 256;// / ((1 << zoomLevel) * 256);
	var metersX = Earth.radius * (lon * Math.PI / 180);
	var x = (Earth.halfCirc + metersX) / arc;
	return x;
}

function yToLatitude(y)
{
	var arc = Earth.circum / 256;// / ((1 << zoomLevel) * 256);

	var metresY = Earth.halfCirc - arc * y;

	var e2my = Math.exp(2 * metresY / Earth.radius);
	var sinLat = (e2my - 1) / (e2my + 1);
	var lat = Math.asin(sinLat) * 180 / Math.PI;

	return lat;
}

function xToLongitude(x)
{
	var arc = Earth.circum / 256;// / ((1 << zoomLevel) * 256);

	var metresX = arc * x - Earth.halfCirc;
	var lon = (metresX / Earth.radius) * 180 / Math.PI;
	return lon;
}

function tileToQuadKey(tx, ty, zl)
{
	var quad = '';
	for (var i = zl; i > 0; i--)
	{
		var mask = 1 << (i - 1);
		var cell = 0;
		if ((tx & mask) != 0)
		{
			cell++;
		}
		if ((ty & mask) != 0)
		{
			cell += 2;
		}
		quad += cell;
	}
	return quad;
}

function tileUrl(tx, ty, zoomLevel)
{
	switch(mapType)
	{
		case "a":
			return "http://ecn.t3.tiles.virtualearth.net/tiles/a" + tileToQuadKey(tx,ty,zoomLevel) + ".png?g=52";
		case "h":
			return "http://ecn.t3.tiles.virtualearth.net/tiles/h" + tileToQuadKey(tx,ty,zoomLevel) + ".png?g=52";
		case "r":
			return "http://ecn.t3.tiles.virtualearth.net/tiles/r" + tileToQuadKey(tx,ty,zoomLevel) + ".png?g=52";
		case "os":
			return "http://ecn.t3.tiles.virtualearth.net/tiles/r" + tileToQuadKey(tx,ty,zoomLevel) + ".png?g=41&productSet=mmOS";
		case "g":
			return "http://mt0.google.com/vt/x=" + Math.floor(tx) + "&y=" + Math.floor(ty) + "&z=" + zoomLevel + "&s=";
	}
}


function createVertexBufferFromData(data)
{
	buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	var bufferData = (data instanceof Float32Array ? data : new Float32Array(data));
	gl.bufferData(gl.ARRAY_BUFFER, bufferData, gl.DYNAMIC_DRAW);
	return buffer;
}
function createTexture(size)
{
	rttTexture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, rttTexture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, size, size, 0, gl.RGB, gl.FLOAT, null);
	return rttTexture;
}

function createFrameBuffer(texture)
{
	rttFrameBuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, rttFrameBuffer);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rttTexture, 0);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	return rttFrameBuffer;
}

function createShader(type, src)
{
	var shader = gl.createShader(type);
	gl.shaderSource(shader, src);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.log("Shader: ", gl.getShaderInfoLog(shader));
	}
	return shader;
}

function createProgram()
{
	var shaderProgram = gl.createProgram();
	
	for(var i = 0; i < arguments.length; i++)
		gl.attachShader(shaderProgram, arguments[i]);
	
	gl.linkProgram(shaderProgram);

	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		console.log("Could not initialise shaders");
	}

	return shaderProgram;
}

function bindBufferToAttribute(program, attributeName, buffer, itemSize)
{
	var attributeLoc = gl.getAttribLocation(program, attributeName);
	gl.enableVertexAttribArray(attributeLoc);
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.vertexAttribPointer(attributeLoc, itemSize, gl.FLOAT, false, 0, 0);
	
}


// *************************************************************
// Init canvas and WebGL
// *************************************************************
var WIDTH = 1000, HEIGHT = 800;
var gpsCentre = new LatLongPos(52.207764,0.127287);
var zoomLevel = 15;
var mapType = "os";
var $canvas = $('#canvas');

$canvas.attr({width:WIDTH, height:HEIGHT})
       .css({position:"relative", left:0, top: 0, width:WIDTH, height:HEIGHT, "z-index":100});

	   $('#canvasContainer').css({width:WIDTH, height:HEIGHT, position: "relative", overflow:"hidden"});
var gl;

try {
	gl = WebGLDebugUtils.makeDebugContext(canvas.getContext("experimental-webgl", {premultipliedAlpha: false}));
	gl.viewportWidth = canvas.width;
	gl.viewportHeight = canvas.height;
} catch (e) {
}
if (!gl) {
	alert("Could not initialise WebGL, sorry :-(");
}

gl.getExtension("OES_texture_float")
gl.clearColor(0.0, 0.0, 0.0, 1.0);

// *************************************************************
// Load GPS Data
// *************************************************************

	var maxx = -Infinity, minx = Infinity, maxy = -Infinity, miny = Infinity;

	gpsCoords = [];
/*
	(function(){
	for (var i in gpsData) {
		//if (i % 4 != 0)
		//	continue;
			
		var x = longitudeToX(gpsData[i].lon);
		var y = latitudeToY(gpsData[i].lat);
		gpsCoords.push([x,y]);
		
		maxx = Math.max(maxx, x);
		maxy = Math.max(maxy, y);
		minx = Math.min(minx, x);
		miny = Math.min(miny, y);
	}
	})();
	console.log("Data parsed");
*/

function loadGpx(url, successCallback)
{
	$.get(url, function(data) {
		var pattern = /lat="(\d*\.\d*)".*lon="(\d*\.\d*)"/g;
		
		match = pattern.exec(data);
		while(match != null)
		{
			var x = longitudeToX(parseFloat(match[2]));
			var y = latitudeToY(parseFloat(match[1]));
			gpsCoords.push([x,y]);
			
			maxx = Math.max(maxx, x);
			maxy = Math.max(maxy, y);
			minx = Math.min(minx, x);
			miny = Math.min(miny, y);
						
			match = pattern.exec(data);
		}
		successCallback();
	}, "text");
}

loadGpx("gpx/2010-05-28 (Punting).gpx", function() {
	initBuffers();
	renderFull();
});

/*loadGpx("gpx/2009-12-18 (Moving House).gpx", function() {
	initBuffers();
	renderFull();
});
loadGpx("gpx/2010-07-01 (Rainbow BBQ and Picnic with Ada).gpx", function() {
	initBuffers();
	renderFull();
});*/


// *************************************************************
// Init texture
// *************************************************************

	var texSize = Math.pow(2, Math.ceil(Math.log(Math.max(WIDTH,HEIGHT))/Math.log(2)));
	
	var rttTexture = createTexture(texSize);
	var rttFrameBuffer = createFrameBuffer(rttTexture);
	
// *************************************************************
// Create shaders.
// *************************************************************
	
	var dataShaders = createProgram(createShader(gl.FRAGMENT_SHADER, $('#fragmentShader').text()),
	                                createShader(gl.VERTEX_SHADER, $('#vertexShader').text()));
	var colorMapShaders = createProgram(createShader(gl.FRAGMENT_SHADER, $('#colorMapFragmentShader').text()),
									    createShader(gl.VERTEX_SHADER, $('#colorMapVertexShader').text()));

var fullViewportQuadBuffer = null;
var trackpointQuadsBuffer = null;
var trackpointsBuffer = null;


function initBuffers()
{
// *************************************************************
// Create vertex buffers
// *************************************************************
	
	var quadCoords = [
		 1.0,  1.0,
		-1.0,  1.0,
		 1.0, -1.0,
		 1.0, -1.0,
		-1.0,  1.0,
		-1.0, -1.0,
	];
	
	// Create a quad that covers the whole viewport
	fullViewportQuadBuffer = createVertexBufferFromData(quadCoords);

	// Create a quad for every trackpoint
	var data = new Float32Array(gpsCoords.length * quadCoords.length);
	for (var i = 0, k = gpsCoords.length; i < k; i++)
		for (var j = 0, l = quadCoords.length; j < l; j++)
			data[i*quadCoords.length + j] = quadCoords[j];
	trackpointQuadsBuffer = createVertexBufferFromData(data);
	console.log("Trackpoint quads created");

	// For all four vertices of each quad, store the same trackpoint.
	var data = new Float32Array(gpsCoords.length * quadCoords.length);
	for (var i = 0, k = gpsCoords.length; i < k; i++)
		for (var j = 0; j < quadCoords.length/2; j++) 
		{
			data[i*quadCoords.length + 2*j] = gpsCoords[i][0];
			data[i*quadCoords.length + 2*j + 1] = gpsCoords[i][1];
		}
	trackpointsBuffer = createVertexBufferFromData(data);
	console.log("Coord vertices created");


}
// *************************************************************
// Render data to texture
// *************************************************************

	function renderData()
	{
		
		gl.useProgram(dataShaders);
		
		gl.uniform2f(gl.getUniformLocation(dataShaders, "uViewportSizeV"), WIDTH, HEIGHT);
		gl.uniform2f(gl.getUniformLocation(dataShaders, "uViewportSizeF"), WIDTH, HEIGHT);
		gl.uniform1f(gl.getUniformLocation(dataShaders, "uSigmaV"), sigma);
		gl.uniform1f(gl.getUniformLocation(dataShaders, "uSigmaF"), sigma);
		gl.uniform1f(gl.getUniformLocation(dataShaders, "uCutoffSigmaV"), 3.5);
		gl.uniform1f(gl.getUniformLocation(dataShaders, "uCutoffSigmaF"), 3.5);
		gl.uniform1f(gl.getUniformLocation(dataShaders, "uZoomLevel"), zoomLevel);
		gl.uniform2fv(gl.getUniformLocation(dataShaders, "uGpsCentre"), gpsCentre.toPixelCoords());
		

		gl.bindFramebuffer(gl.FRAMEBUFFER, rttFrameBuffer);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);

		bindBufferToAttribute(dataShaders, "aVertexPosition", trackpointQuadsBuffer, 2);
		bindBufferToAttribute(dataShaders, "aGpsCoord", trackpointsBuffer, gpsCoords[0].length);
				
		gl.viewport(0, 0, WIDTH, HEIGHT);
		var batchSize = 1000;
		for(var i = 0; i < gpsCoords.length - batchSize; i = i + batchSize)
		{
			gl.drawArrays(gl.TRIANGLES, i*6, 6*batchSize);
			gl.flush();
		}
		gl.drawArrays(gl.TRIANGLES, i*6, (gpsCoords.length-i) * 6);
		gl.flush();

		gl.disable(gl.BLEND);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}
	
// *************************************************************
// Render texture to screen
// *************************************************************

	
	function renderTexture(norm)
	{
		gl.useProgram(colorMapShaders);
		
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, rttTexture);
		gl.uniform1i(gl.getUniformLocation(colorMapShaders, "uTexture"), 0);
		
		gl.uniform2f(gl.getUniformLocation(colorMapShaders, "uTextureSize"), texSize, texSize);
		gl.uniform2f(gl.getUniformLocation(colorMapShaders, "uViewportSize"), WIDTH, HEIGHT);
		gl.uniform1f(gl.getUniformLocation(colorMapShaders, "uNorm"), norm / (1 << zoomLevel));

/*		gl.uniform4fv(gl.getUniformLocation(colorMapShaders, "uColorMap"), [255, 255, 204, 0,
																			255, 237, 160, 20,
																			254, 217, 118, 50,
																			254, 178, 76, 80,
																			253, 141, 60, 100,
																			252, 78, 42, 150,
																			227, 26, 28, 170,
																			177, 0, 38, 230,]);
*/
		gl.uniform4fv(gl.getUniformLocation(colorMapShaders, "uColorMap"), [255, 255, 204, 0,
																			255, 255, 204, 50,
																			255, 255, 204, 100,
																			255, 255, 204, 120,
																			254, 217, 118, 150,
																			253, 141, 60, 180,
																			227, 26, 28, 200,
																			177, 0, 38, 200,]);
																			
		gl.viewport(0, 0, WIDTH, HEIGHT);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		
		bindBufferToAttribute(colorMapShaders, "aVertexPosition", fullViewportQuadBuffer, 2);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}
	

// *************************************************************
// Render map tiles
// *************************************************************

	
	function renderTiles()
	{
		// Centre tile
		
		var centreP = gpsCentre.toPixelCoords();
		var tx = centreP[0] * (1 << zoomLevel) / 256;
		var ty = centreP[1] * (1 << zoomLevel) / 256;
		
		var centreTileUrl = tileUrl(tx,ty,zoomLevel);
		
		var fx = (tx - Math.floor(tx)) * 256;
		var fy = (ty - Math.floor(ty)) * 256;
		
		var tileLeft = WIDTH / 2 - fx;
		var tileTop = HEIGHT / 2 - fy;

		var leftTileCount = Math.ceil(tileLeft / 256);
		var topTileCount = Math.ceil(tileTop / 256);
		
		var tileMinLeft = tileLeft - leftTileCount * 256;
		var tileMinTop = tileTop - topTileCount * 256;
		var tileMinTx = tx - leftTileCount;
		var tileMinTy = ty - topTileCount;
		
		var tileCountX = Math.ceil((WIDTH - tileMinLeft) / 256) ;
		var tileCountY = Math.ceil((HEIGHT - tileMinTop) / 256) ;
		$('#canvasContainer img').remove();
		for (var i = 0; i < tileCountX; i++)
		{
			for(var j = 0; j < tileCountY; j++)
			{
				var url = tileUrl(tileMinTx + i, tileMinTy + j, zoomLevel);
				$('#canvasContainer').prepend($("<img />").attr("src", url).css(
					{
						position: "absolute", 
						left: tileMinLeft + 256*i, 
						top: tileMinTop + 256*j,
						opacity: 1,
						"z-index":0,
						//border: "1px dashed #f80",
					}));
			}
		}		
	}

// *************************************************************
// General stuff
// *************************************************************
	
	function tick()
	{
		renderData();
		renderTexture(norm*sigma);
		renderTiles();
	}	
	function renderFull()
	{
		requestAnimationFrame(tick);
	}
	function renderEasy()
	{
		requestAnimationFrame(function(){renderTexture(norm*sigma);});
	}
	function renderTrivial()
	{
		requestAnimationFrame(renderTiles);
	}
	
	var norm = 500000;
	var sigma = 16;
	
	$("#sigmaSlider").attr("value", sigma).change(function(e) {sigma = e.target.valueAsNumber; renderFull()});
	$("#normSlider").attr("value",norm).change(function(e) {norm = e.target.valueAsNumber; renderEasy();});
	
	var mouseDownE = null;
	var mouseDownSigma = null;
	function canvas_MouseMove(e)
	{
		//console.log("MOVE", e);
		
		if (mouseDownE)
		{
			var dx = e.x - mouseDownE.x;
			var dy = e.y - mouseDownE.y;
			
			var dPx = dx / Math.pow(2,zoomLevel);
			var dPy = dy / Math.pow(2,zoomLevel);
			
			var newCentrePx = mouseDownE.centrePx - dPx;
			var newCentrePy = mouseDownE.centrePy - dPy;
			
			gpsCentre = new LatLongPos(yToLatitude(newCentrePy), xToLongitude(newCentrePx));
			renderTrivial();		
			
		}
	}
	
	function canvas_MouseDown(e)
	{
		//console.log("DOWN", e);
		mouseDownE = e;
		mouseDownSigma = sigma;
		sigma = 1;
	}
	
	function canvas_MouseUp(e)
	{
		//console.log("UP", e);
		mouseDownE = null;
		sigma = mouseDownSigma;
		renderFull();		
	}
	
	function canvas_MouseWheel(e)
	{
		if (e.delta > 0)
		{
			zoomLevel++;
		}
		else
		{
			zoomLevel--;
		}
		renderTrivial();
		renderFull();
	}
	
	function mousePosInfo(element, e, zoomLevel, gpsCentre)
	{
		var off = element.offset();
		var x = e.pageX - off.left;
		var y = e.pageY - off.top;
		
		// Get distance in pixels from centre of viewport
		
		var dx = x - WIDTH / 2;
		var dy = y - HEIGHT / 2;
		dx = dx / Math.pow(2,zoomLevel);
		dy = dy / Math.pow(2,zoomLevel);
		
		// convert that into XY position of cursor
		
		var centreP = gpsCentre.toPixelCoords();
		var pX = centreP[0] + dx;
		var pY = centreP[1] + dy;
		
		var lat = yToLatitude(pY);
		var lon = xToLongitude(pX);

		return {x: x,
				y: y,
				zoomLevel: zoomLevel,
				pX: pX,
				pY: pY,
				centrePx: centreP[0],
				centrePy: centreP[1],
				lat: lat,
				lon: lon,
				gpsPos: new LatLongPos(lat,lon),
				};
				
	}
	
	$canvas.mousemove(function(e) {return canvas_MouseMove(mousePosInfo($canvas, e, zoomLevel, gpsCentre));});
	$canvas.mousedown(function(e) {return canvas_MouseDown(mousePosInfo($canvas, e, zoomLevel, gpsCentre));});	
	$canvas.mouseup(function(e) {return canvas_MouseUp(mousePosInfo($canvas, e, zoomLevel, gpsCentre));});
	$canvas.mousewheel(function(e,delta) {var newE = mousePosInfo($canvas, e, zoomLevel, gpsCentre); newE.delta = delta; canvas_MouseWheel(newE);});
	
	function canvas_Drop(e)
	{
		e.originalEvent.stopPropagation();
		e.originalEvent.preventDefault();
		 
		var files = e.dataTransfer.files;
	
		for(var f in files)
		{
			var reader = new FileReader();
	 
			// init the reader event handlers
			reader.onload = function(evt) {
				console.log(evt);
				
				var str = evt.target.result;
				
				var lonIdx = 0;
				while(true)
				{
					var latIdx = str.indexOf("lat=\"",lonIdx+1);
					if (latIdx == -1)
						break;
					var closeIdx = str.indexOf("\"", latIdx+5);
					var lat = parseFloat(str.substr(latIdx+5, closeIdx-latIdx-5));
					
					lonIdx = str.indexOf("lon=\"", closeIdx);
					closeIdx = str.indexOf("\"", lonIdx+5);
					var lon = parseFloat(str.substr(lonIdx+5, closeIdx-lonIdx-5));
					
					var x = longitudeToX(lon);
					var y = latitudeToY(lat);
					gpsCoords.push([x,y]);
				}
				initBuffers();
				renderFull();
			};
			 
			// begin the read operation
			reader.readAsText(files[f]);
		}
	}
	
	function noopEvent(e)
	{
		e.stopPropagation();
		e.preventDefault();
	}
	
	jQuery.event.props.push('dataTransfer');
	$canvas.bind("dragenter", noopEvent);
	$canvas.bind("dragexit", noopEvent);
	$canvas.bind("dragover", noopEvent);
	$canvas.bind("drop", canvas_Drop);
	
	$(document).ready(function(){
            $("body").css("-webkit-user-select","none");
            $("body").css("-moz-user-select","none");
            $("body").css("-ms-user-select","none");
            $("body").css("-o-user-select","none");
            $("body").css("user-select","none");
        });
	
	$("input[name='mapType']").change(function(e) {mapType = e.target.value; renderTrivial();});
	
	
	
	
	
	
	
	