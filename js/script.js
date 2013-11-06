// models

var Region = Backbone.Model.extend({
    pointInRegion: function(point) {
        var x = point[0];
        var y = point[1];
        var vs = [];

        _.each(this.get('geometry').coordinates, function(v) {
            if (v.length === 1) { v = _.flatten(v, true); }

            vs.push(v);
        });

        vs = _.flatten(vs, true);

        var inside = false;
        for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            var xi = vs[i][0], yi = vs[i][1];
            var xj = vs[j][0], yj = vs[j][1];

            var intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }

        return inside;
    }
});

var Result = Backbone.Model.extend({
    idAttribute: 'race',

    getRaceDescription: function() {
      var map = {
        'Prop 1': "Ad valorem tax exempt of homestead for one's spouse killed in action",
        'Prop 2': "Eliminate the State Medical Board and its Education Fund",
        'Prop 3': "Extend # of days that aircraft parts are exempt from ad valorem tax",
        'Prop 4': "Exempt from ad valorem tax of donated home to a disabled vet",
        'Prop 5': "Authorize reverse mortgage loans when purchasing homestead property",
        'Prop 6': "Create a State Water Implementation Fund",
        'Prop 7': "Authorize home-rule cities to fill vacancy procedures in charter",
        'Prop 8': "Repeal TX Constitution's max tax rate for a Hidalgo Co hosp district",
        'Prop 9': "Expand potential sanctions against a judge or justice"
      };
      return map[this.get('race')];
    },

    getPercentageFor: function() {
        return (this.get('in_favor') / this.get('total_votes')) * 100;
    },

    getPercentageForDisplay: function() {
      var r = this.getPercentageFor().toFixed(2);
      return isNaN(r) ? 0 : r;
    },

    getPercentageAgainstDisplay: function() {
      var r = this.getPercentageFor().toFixed(2);
      return isNaN(r) ? 0 : (100 - r).toFixed(2);
    }
});

var Propsition = Backbone.Model.extend({
    idAttribute: 'county',

    initialize: function() {
        var here = this;
        var found = _.find(counties.features, function(c) {
            return c.properties.key === here.get('county');
        });
        if(found) {
            this.set('shape', found.geometry);
            var name = here.get('county');
            this.set('layer', L.geoJson(this.get('shape'), {onEachFeature: _.bind(this.clickOnShape, name)}));
        }
    },

    clickOnShape: function(feature, layer) {
        var here = this;
        layer.on('click', function(e) {
            var name = '';
            _.each(here, function(a){name=name+a});
            results.fetch({data: {county: name}});
            propositions.selectCounty(name);
        });
    },

    isPassing: function() {
        return this.get('in_favor') > this.get('against');
    },

    getBounds: function() {
        return this.get('layer').getBounds();
    }
});

// collections

var Regions = Backbone.Collection.extend({
    model: Region,

    findEnclosingRegion: function(point) {
        var found_region = this.find(function(r) {
            return r.pointInRegion(point);
        });

        return found_region;
    }
});


var Results = Backbone.Collection.extend({
    model: Result,
    comparator: 'race',

    url: '//tranquil-sierra-7858.herokuapp.com/api/location/?callback=?'
});

var Propsitions = Backbone.Collection.extend({
    model: Propsition,

    url: '//tranquil-sierra-7858.herokuapp.com/api/race/?callback=?',

    selectCounty: function(val) {
        var active = this.findWhere({county: val});
        mapView.setBounds(active.getBounds());
    }
});

var regions = new Regions();
var results = new Results();
var stateResults = new Results();
var propositions = new Propsitions();

// views

var MapView = Backbone.View.extend({
    initialize: function() {
        this.map = L.mapbox.map('map');
        this.baseLayer = L.mapbox.tileLayer('texastribune.map-0jxemcn5', {
            detectRetina: true
        });
        this.map.setView([31.35, -99.64], 6);
        this.map.scrollWheelZoom.disable();
        this.baseLayer.addTo(this.map);
    },

    setBounds: function(bounds) {
        this.map.fitBounds(bounds);
    }
});

var GeolocateView = Backbone.View.extend({
    el: '#geolocate',

    events: {
        'click .find-me': 'htmlGeolocate',
        'click .search': 'addressGeolocate'
    },

    initialize: function() {
        if (!navigator.geolocation) {
            this.$('.find-me').hide();
        }
    },

    locate: function(point) {
        $('#load-indicator').toggleClass('hidden');
        var found = regions.findEnclosingRegion(point);

        countySelectorView.selectCounty(found.get('properties').key);
    },

    htmlGeolocate: function(e) {
        e.preventDefault();
        $('#load-indicator').toggleClass('hidden');
        var locate = this.locate;
        navigator.geolocation.getCurrentPosition(function(position) {
            locate([position.coords.longitude, position.coords.latitude]);
        });
    },

    // uses MapQuest Nominatim to geolocate an address
    addressGeolocate: function(e) {
        e.preventDefault();
        $('#load-indicator').toggleClass('hidden');
        var locate = this.locate;
        var request = this.$('input[type=text]').val();

        $.ajax({
            url: '//open.mapquestapi.com/nominatim/v1/search?format=json&countrycodes=us&limit=1&addressdetails=1&q=' + request,
            cache: false,
            dataType: 'jsonp',
            jsonp: 'json_callback'
        })
        .done(function(response) {
            result = response[0];
            if (result === undefined) {
                alert('A location could not be found. Please try searching with a ZIP Code.');
                $('#load-indicator').toggleClass('hidden');
                return false;
            } else {
                var lat = result.lat;
                var lon = result.lon;
                var state = result.address.state;
                if (state !== 'Texas') {
                    alert('The address that returned is not in Texas. Please try making your query more detailed.');
                    $('#load-indicator').toggleClass('hidden');
                    return false;
                }

                locate([lon, lat]);
            }
        })
        .fail(function() {
            alert('The attempt to find your location failed. Please try again.');
        });
    }
});

var ShapeView = Backbone.View.extend({
    baseStyle: {
        weight: 2,
        color: 'rgb(26, 26, 26)',
        fillOpacity: 0.8
    },

    initialize: function() {
        this.listenTo(this.model, 'change', this.alterAppearance);
        this.alterAppearance();
    },

    alterAppearance: function() {
        var color = this.model.isPassing() ? '#117bb8' : '#a98d5a';
        this.model.get('layer').setStyle(
            _.extend(this.baseStyle, {fillColor
                : color})
        );
    }
});

var AllShapesView = Backbone.View.extend({
    initialize: function() {
        this.listenTo(propositions, 'reset', this.render);
    },

    render: function() {
        propositions.each(function(p) {
            if (p.get('shape')) {
                var shape = new ShapeView({model: p});
                mapView.map.addLayer(shape.model.get('layer'));
            }
        });
    }
});

var ResultHeaderView = Backbone.View.extend({
    tagName: 'div',

    template: _.template($('#result-header-template').html()),

    initialize: function() {
        this.listenTo(this.model, 'change', this.render);
    },

    render: function() {
        this.$el.html(this.template(this.model.toJSON()));
        return this;
    }
});

var ResultView = Backbone.View.extend({
    tagName: 'div',

    template: _.template($('#result-template').html()),

    initialize: function() {
        this.listenTo(this.model, 'change', this.render);
    },

    render: function() {
        this.$el.html(this.template(this.model.toJSON()));
        return this;
    }
});

var CompiledResultView = Backbone.View.extend({
    tagName: 'ul',

    render: function() {
        var payload = [];

        this.collection.each( function(model) {
            var view = new ResultView({model: model});
            payload.push(view.render().el);
        });

        this.$el.html(payload);
        return this;
    }
});

var ResultContainerView = Backbone.View.extend({
    el: '#result-container',

    initialize: function() {
        this.listenTo(results, 'reset', this.render);
    },

    render: function() {
        var headerView = new ResultHeaderView({model: results.at(0)});
        var compiledView = new CompiledResultView({collection: results});
        this.$el.append(headerView.render().el);
        this.$el.append(compiledView.render().el);
        return this;
    }
});

var StateResultContainerView = Backbone.View.extend({
    el: '#state-result-container',

    initialize: function() {
        this.listenTo(stateResults, 'reset', this.render);
    },

    render: function() {
        (new StatePrecinctsReportingView({model: stateResults.at(0)})).render();
        var compiledView = new CompiledResultView({collection: stateResults});
        this.$el.append(compiledView.render().el);
        return this;
    }
});

var CountySelectorView = Backbone.View.extend({
    el: '#county-select',

    events: {
        'change': 'selectCounty'
    },

    selectCounty: function(county) {
        var val;

        if (county && !_.isObject(county)) {
            val = county;
        } else {
            val = this.$el.val();
        }
        if (val === '') {
          return;
        }
        results.fetch({data: {county: val}});

        propositions.selectCounty(val);

        this.$el.val(val);
    }
});

var StatePrecinctsReportingView = Backbone.View.extend({
  el: 'section.statewide h2 small',
  template: _.template('<%= precincts_reported %> of <%= total_precincts %> precincts reporting'),

  render: function() {
    if (this.model === undefined) { return this; }
    this.$el.html(this.template(this.model.toJSON()));
    return this;
  }
});

// bootstrap

var mapView = new MapView();
var GeolocateView = new GeolocateView();
var resultContainerView = new ResultContainerView();
var stateResultsContainerView = new StateResultContainerView();
var countySelectorView = new CountySelectorView();
var allShapesView = new AllShapesView();

stateResults.fetch({reset: true});
results.fetch({reset: true});
propositions.fetch({reset: true, data: {prop: 6}});
regions.reset(counties.features);

if (jQuery(window).width() < 540) {
    $('#map')[0].style.display = 'none';
    var resultContainer = $('#result-container').parent()[0];
    resultContainer.className = 'cell w-12 sidebar';
}
