// models

var County = Backbone.Model.extend({
    parse: function(res) {
        _.each(res.properties, function(val, key) {
            res[key] = val;
        });

        res['for_votes'] = _.random(0, 100);
        delete res.properties;
        return res;
    }
});

// collections

var Counties = Backbone.Collection.extend({
    model: County
});

var counties = new Counties();
var activeRegion = new Backbone.Collection();

// views

var MapView = Backbone.View.extend({
    initialize: function() {
        this.map = L.mapbox.map('map');
        this.baseLayer = L.mapbox.tileLayer('texastribune.map-sit023yd', {
            detectRetina: true
        });
        this.map.setView([31.35, -99.64], 5);
        this.map.scrollWheelZoom.disable();
        this.baseLayer.addTo(this.map);
    }
});

var LayerView = Backbone.View.extend({
    initialize: function() {
        this.gjLayer = L.geoJson();
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

var ResultView = Backbone.View.extend({
    tagName: 'div',

    template: _.template($('#result-template').html()),

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
        this.listenTo(activeRegion, 'reset', this.render);
    },

    render: function() {
        var compiledView = new CompiledResultView({collection: activeRegion});
        this.$el.html(compiledView.render().el);
        return this;
    }
});

// bootstrap

var mapView = new MapView();
var resultContainerView = new ResultContainerView();

counties.add(counties_data.features, {parse: true});
activeRegion.reset(counties.models);
