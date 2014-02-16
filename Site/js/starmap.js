// Starmap display methods

var width, height, cx, cy, R;

var nodes;

var position = [ 0, 0 ];

var stars_moving = 0;

var SPIN_TIME = 1000;

var STAR_THRESHOLD = 400;
var STAR_OPACITY = 1;

var RFACTOR = .9;


var CURSOR_RADIUS = 13;
var CURSOR_XY = CURSOR_RADIUS / 1.414213562;

var DOMAINS = {
    "ra": { "min": 0, "max": 6.283 },
    "dec": { "min": 1.57, "max": -1.57 },
    "magnitude": { "min": 26, "max": -2  },
    "absmagnitude": { "min": 18, "max": -11 },
    "distance": { "min": 0, "max": 6100 },
    "colourindex": { "min":  -0.274, "max": 2.994 },
    "id": { "min": 0, "max": 403 }
};

var history = [];

// two states: sphere and plot

var state = 'sphere';

var centre_star = false;

var DIST_SCALE = 200;
var DIST_INIT = 10;
var DIST_F = true;

// General 3D rotation functions

function rad2deg(rad) {
    return 180 * rad / Math.PI;
}

function deg2rad(deg) {
    return Math.PI * deg / 180;
}


function rotate2(vect2, theta) {
    var c = Math.cos(theta);
    var s = Math.sin(theta);

    var rvect = [ c * vect2[0] - s * vect2[1], s * vect2[0] + c * vect2[1] ];
    
    return rvect;
}

function rotate3(vect3, ra, dec) {
    var rvect3 = [ 0, 0, 0 ];
    var vect2 = rotate2([ vect3[0], vect3[1] ], ra);

    rvect3 = [ vect2[0], vect2[1], vect3[2] ];
    vect2 = rotate2( [ rvect3[0], rvect3[2] ], dec );
    
    rvect3[0] = vect2[0];
    rvect3[2] = vect2[1];
    
    return rvect3
}


//// Functions for rendering stars on the celestial sphere

function magnitude_f(d) {
    var size = 7 / Math.sqrt(1.5 + d.magnitude * .5);
    //var size = 10 / Math.sqrt(1.5 + d.magnitude * .5);
    if ( size < 2 ) {
	    size = 2;
    }
    return size;
}


// star_sphere(star, [ ra, dec ], r) - take a rotation [ra, dec],
// and rotate the star's unit vector by it. 

function star_sphere(d, coords, radius) {

    var rvect = rotate3(
	    [ d.vector.x, d.vector.y, d.vector.z ],
	    deg2rad(coords[0]), deg2rad(coords[1])
    );
    
    var r = radius;
    if( DIST_F ) {
        r = radius * d.distance;
    }
    console.log(d.name + " " + r);
    d.x = cx + r * rvect[1];
    d.y = cy + r * rvect[2];
    d.z = r * rvect[0];
    return d;
}


function star_opacity(d) {
    if( d.z < -STAR_THRESHOLD ) {
	    return 0;
    }
    if( d.z > STAR_THRESHOLD ) {
	    return STAR_OPACITY;
    }
    return 0.5 * STAR_OPACITY * (d.z + STAR_THRESHOLD) / STAR_THRESHOLD;
}



// generalised transition function.
//
// interp_f(d) - interpolator factory function: returns a tween
//               function (t => the star datum) for a given star

function stars_transition(interp_f, duration, after_f) {

    stars_moving = 1;
    
    nodes.transition()
	    .duration(duration)
	    .attrTween("transform", function(d, i, a) {
            var startween = interp_f(d);
            return function(t) {
                var s = startween(t);
                return "translate(" + s.x + "," + s.y + ")";
            }
        });

    d3.selectAll("circle.star")
	    .transition()
	    .duration(duration)
	    .styleTween("opacity", function(d, i, a) {
            var startween = interp_f(d);
            return function(t) {
                var s = startween(t);
                return star_opacity(s);
            }
        })
	    .each("end", after_f);
 
    stars_moving = 0;
}



function select_star(star, spintime) {

    var start, finish;

    if( centre_star ) {
        start = [ centre_star.ra, centre_star.dec ];
    } else {
        start = [ 0, 0 ];
    }
    
    finish = [ star.ra, star.dec ];

    // tween_f = tween factory: for each star returns a tween
    // function t => star datum

    var tween_f;

    if( state == 'sphere' ) {
        // If we're already in the sphere, calculate great-circle 
        // paths so that the 3D illusion works

        var great_circle = d3.geo.interpolate(
	        [ rad2deg(-start[0]), rad2deg(-start[1]) ],
	        [ rad2deg(-finish[0]), rad2deg(-finish[1]) ]
        );

        var rad_f;

        if( DIST_F ) {
            var sdist;
            if( centre_star ) {
                sdist = DIST_SCALE / centre_star.distance;
            } else {
                sdist = DIST_SCALE / DIST_INIT;
            }
            rad_f = d3.interpolate(sdist, DIST_SCALE / star.distance);
        } else {
            rad_f = function(t) { return R; }
        }

        // distance scaling: make DIST_R = SOMECONST / star.distance,
        // so the distance value has to linearly interpolate within
        // star_sphere

        tween_f = function(d) {
            return function(t) {
                return star_sphere(d, great_circle(t), rad_f(t));
            }
        };
    } else {
        // We are starting from a plot, so we don't need to calculate
        // great-circle paths.
        tween_f = function(d) {
            var s = { "x": d.x, "y": d.y, "z": d.z };
            var f = star_sphere(d, [ rad2deg(-finish[0]), rad2deg(-finish[1]) ], function(t) { return R; } ); 
            return d3.interpolate(s, f);
        }
    }

    state = 'sphere';
    centre_star = star;
    
    $("div#about").hide();
    $(".pointer").hide();

    stars_transition(tween_f, spintime, function(e) {
	    d3.select(this).each(function(d, i) {
		    if( d.id == star.id ) {
                hide_star_text();
		        show_star_text(d);
                $(".pointer").show();
		    }
	    });
	});
    
}


//// render_plot(plot_f);
//
// Transition all stars to a scatterplot - plot_f(d) takes a star and
// resets its datum x, y, z.  Uses each star's initial x, y, z as the
// starting point.


function render_plot(xparm, yparm, xrange, yrange) {

    // tween_f = tween factory: for each star returns a tween
    // function t => star datum
    
    var spintime = 1000;
    
    var plot_f = make_plot_f(xparm, yparm, xrange, yrange);

    // a straight tween between wherever each star is, and 
    // where we want it to be on the plot

    var tween_f = function(d) {
        var start = { "x": d.x, "y": d.y, "z": d.z };
        var finish = plot_f(d);
        return d3.interpolate(start, finish);
    }

    if( state == 'sphere' ) {
        $("div#about").hide();
        $(".pointer").hide();
    }

    state = 'plot';

    stars_transition(tween_f, spintime, function(e) {
	    d3.select(this).each(function(d, i) {
            var p3 = plot_f(d);
            d.x = p3.x;
            d.y = p3.y;
            d.z = p3.z
	    });
    });

}

function make_plot_f(xparm, yparm, xrange, yrange) {
    var xd = DOMAINS[xparm];
    var yd = DOMAINS[yparm];
    var xscale = d3.scale.linear()
        .domain([xd.min, xd.max])
        .range([10, xrange - 10]);
    var yscale = d3.scale.linear()
        .domain([yd.min, yd.max])
        .range([yrange - 10, 10]);

    return function(d) {
        return {
            "x": xscale(d[xparm]),
            "y": yscale(d[yparm]),
            "z": 100
        }
    };
}


function testplot(d) {
    return {
        "x": 50 + d.magnitude * 40,
        "y": 10 + (d.name.charCodeAt(0) - 65) * 30,
        "z": 100
    };
}

// absmag (-10.9 to 14) - colourindex ( -0.274 - 2.994 )

function test_hr_plot(d) {
    return {
        "x": 100 + d.colourindex * 240,
        "y": 360 + d.absmagnitude * 21,
        "z": 100
    };
}


// distance from Sol

// colourindex ( -0.274 - 2.994 )

function test_hr_plot(d) {
    return {
        "x": 100 + d.colourindex * 240,
        "y": 360 + d.absmagnitude * 21,
        "z": 100
    };
}


///// Calibration 








///// Functions for displaying/hiding the star text
//
//

function show_star_text(d) {
    $("div#text").removeClass("O B A F G K M C P W S start");
    $("input#starname").removeClass("O B A F G K M C P W S start");
    $("div#text").addClass(d.class);
    $("input#starname").addClass(d.class);
    $("div#text").removeClass("hidden");
    $("input#starname").val(d.name);
    $("div#stardesignation").text(d.designation);
    $("div#description").html(d.text);
    /* $("div#coords").html(d.id); */ 
    
    /* TODO: lines from links to circles? */
    
    $("span.link").each(
        function (index) {
            var starid = $(this).attr('star');
            var star = stars[starid];
            if( star ) {
                console.log("Link for " + starid + " : " + star.name);
                $(this).click(
                    function(e) {
                        select_star(star, SPIN_TIME);
                    }
                )
            } else {
                console.log("Warning: star " + starid + " not found");
            }
        }
    );

}


function hide_star_text() {
    $("div#text").addClass("hidden");
}


function add_history(star) {
    history.push(star);
    console.log("history = " + history + "; " + star);
    draw_history();
}




function draw_history() {
    $('#history').empty();

    if( history.length > 0 ) {
        var last = history[history.length - 1];
        $('#history').append('<span id="hlink">⬅' + last.name + '</span>');
        $('span#hlink').click(
            function(e) {
                console.log("clicked");
                history = [];
                select_star(last, SPIN_TIME);
                draw_history();
            }
        );
    }
}



function highlight_partial(str) {
    d3.selectAll("circle")
	    .classed("cursor", function (d) {
	        if( d.name.substr(0, str.length) == str.toUpperCase() ) {
		        return 1;
	        } else {
		        return 0;
	        }
	});
}


function auto_complete_stars(text) {
    if( text.length ) {
	    highlight_partial(text);
    } else {
	    d3.selectAll("circle")
	        .classed("cursor", 0);
    }
}



function highlight_constellation(constellation) {
    console.log("Highlight " + constellation);
    d3.selectAll("circle")
        .each(function (d) {

            if( d.constellation == constellation ) {
                console.log(this.id + " show");
                $('#' + this.id).removeClass('hidden');
            } else {
                console.log(this.id + " hide");
                $('#' + this.id).addClass('hidden');
            } 
        }
             );
}




function render_map(elt, w, h, gostar) {
    
    width = w;
    height = h;
    
    cx = width * 0.5;
    cy = height * 0.5;
    R = cx * RFACTOR;

    DOMAINS["namelength"] = { "min": 1000, "max": 0 };

    for ( var i = 0; i < stars.length; i++ ) {
        stars[i].namelength = stars[i].name.length;
        if( stars[i].namelength < DOMAINS["namelength"]["min"] ) {
            DOMAINS["namelength"]["min"] = stars[i].namelength;
        }
        if( stars[i].namelength > DOMAINS["namelength"]["max"] ) {
            DOMAINS["namelength"]["max"] = stars[i].namelength;
        }
    }
    
    console.log(DOMAINS);
    
    var svg = d3.select(elt).append("svg:svg")
        .attr("width", width)
	    .attr("height", height);
    
    nodes = svg.selectAll("g")
    	.data(stars)
    	.enter()
    	.append("g")
    	.attr("transform",
    	      function(d) {
    		      var s = star_sphere(d, [0, 0], DIST_SCALE / DIST_INIT);
                  return "translate(" + s.x + "," + s.y + ")";
    	      });
    
    var mag_scale = d3.scale.sqrt().domain([17, -10]).range([1,10])

    nodes.append("circle")
    	.attr("r", function(d) { return mag_scale(d.absmagnitude) } )
    	.attr("class", function(d) { return "star " + d.class } )
        .attr("id", function(d, i) { return "circle_" + i })
    	.style("opacity", star_opacity)
    	.on("click", function(d) {
    	    if( !stars_moving && d.z > -STAR_THRESHOLD ) {
    		    select_star(d, SPIN_TIME);
    		    d3.event.stopPropagation();
    	    }
    	});

    nodes.append("title").text(function(d) { return d.name });
    
    svg.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", CURSOR_RADIUS)
        .attr("class", "pointer");

    svg.append("line")
        .attr("x1", cx + CURSOR_XY)
        .attr("y1", cy - CURSOR_XY)
        .attr("x2", width).attr("y2", 40)
        .attr("class", "pointer");
    
    
    
    
    if( gostar ) {
        var star = false;
        if( /^\d+$/.exec(gostar) ) {
            star = stars[gostar]
        } else {
            star = find_star(gostar.toUpperCase());
        }
        if( star ) {
            select_star(star, 0);
        }
    }


}




