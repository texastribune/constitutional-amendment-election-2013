// models

var Result = Backbone.Model.extend({
    parse: function(res) {
        res['in_favor'] = _.random(0, 200);
        res['total_votes'] = _.random(200, 400);

        return res;
    },

    idAttribute: 'race',

    getPercentageFor: function() {
        return (this.get('in_favor') / this.get('total_votes')) * 100;
    }
});

var Propsition = Backbone.Model.extend({
    parse: function(res) {
        res['in_favor'] = _.random(0, 400);
        res['against'] = _.random(0, 400);

        return res;
    },

    idAttribute: 'county',

    initialize: function() {
        var here = this;
        var found = _.find(counties.features, function(c) {
            return c.properties.key === here.get('county');
        });
        if(found) { this.set('shape', found.geometry); }
    },

    isPassing: function() {
        return this.get('in_favor') > this.get('against');
    }
});

// collections

var Results = Backbone.Collection.extend({
    model: Result,

    url: '//tranquil-sierra-7858.herokuapp.com/api/location/?callback=?'
});

var Propsitions = Backbone.Collection.extend({
    model: Propsition,

    url: '//tranquil-sierra-7858.herokuapp.com/api/race/?callback=?'
});

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
    }
});

var GeolocateView = Backbone.View.extend({
    el: '#geolocate',

    events: {
        'click .find-me': 'htmlGeolocate',
        'submit .geo-search': 'addressGeolocate'
    },

    locate: function(point) {
        $('#load-indicator').toggleClass('hidden');
        regions.determineActiveRegion(point);
        activePoint.set('point', point);
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
            jsonp: 'json_callback',
            success: function(response) {
                result = response[0];
                if (result === undefined) {
                alert('A location could not be found. Please try searching with a ZIP Code.');
                return false;
                } else {
                    var lat = result.lat;
                    var lon = result.lon;
                    var state = result.address.state;
                    if (state !== 'Texas') {
                        alert('The address that returned is not in Texas. Please try making your query more detailed.');
                        return false;
                    }

                    locate([lon, lat]);
                }
            }
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
        this.render();
        this.alterAppearance();
    },

    render: function() {
        this.layer = L.geoJson(this.model.get('shape'), this.baseStyle);
        return this;
    },

    alterAppearance: function() {
        var color;

        if (this.model.isPassing()) {
            color = '#4c5a69';
        } else {
            color = '#929aa3';
        }

        this.layer.setStyle(
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
                mapView.map.addLayer(shape.layer);
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

    selectCounty: function(e) {
        var val = this.$el.val();

        if (val === 'All COUNTIES') {
            results.fetch();
        } else {
            results.fetch({data: {county: this.$el.val()}});
        }
    }
});

// bootstrap

var mapView = new MapView();
var resultContainerView = new ResultContainerView();
var stateResultsContainerView = new StateResultContainerView();
var countySelectorView = new CountySelectorView();
var allShapesView = new AllShapesView();

stateResults.fetch({reset: true});
results.fetch({reset: true});
propositions.fetch({reset: true, data: {prop: 6}});
