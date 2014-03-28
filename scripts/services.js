angular.module('XivelyApp.services', ['ngResource'])

    .constant('DEFAULT_SETTINGS', {
        'tempUnits': 'c',
        'keyXively': '6kg3pKWwG6eyx2jRWNrTwSmpOFp9B6kSArV9kWm8iLkJ4gaR',
        'feedXively': '673258092',
        'timeScale': 3600
    })
    .constant('SCANDIT_API_KEY', 'cFzwjrDwEeOHumeEBBIoRqXMaSSy36Uq4650VHVlShc')
    .constant('FLICKR_API_KEY', '504fd7414f6275eb5b657ddbfba80a2c')
    .constant('OPENWEATHER_API_KEY', 'a8c98220ff98a42893423c2f6627e39f')


    .factory('cordova', function () {
        return window.cordova; // assumes cordova has already been loaded on the page
    })

    .factory('Settings', function ($rootScope, DEFAULT_SETTINGS) {
        var _settings = {};
        try {
            _settings = JSON.parse(window.localStorage['settings']);
        } catch (e) {
        }

        // Just in case we have new settings that need to be saved
        _settings = angular.extend({}, DEFAULT_SETTINGS, _settings);

        if (!_settings) {
            window.localStorage['settings'] = JSON.stringify(_settings);
        }

        var obj = {
            getSettings: function () {
                return _settings;
            },
            // Save the settings to localStorage
            save: function () {
                window.localStorage['settings'] = JSON.stringify(_settings);
                $rootScope.$broadcast('settings.changed', _settings);
            },
            // Get a settings val
            get: function (k) {
                return _settings[k];
            },
            // Set a settings val
            set: function (k, v) {
                _settings[k] = v;
                this.save();
            },

            getTempUnits: function () {
                return _settings['tempUnits'];
            }
        };

        // Save the settings to be safe
        obj.save();
        return obj;
    })

    .factory('Geo', function ($q) {
        return {
            reverseGeocode: function (lat, lng) {
                var q = $q.defer();

                var geocoder = new google.maps.Geocoder();
                geocoder.geocode({
                    'latLng': new google.maps.LatLng(lat, lng)
                }, function (results, status) {
                    if (status == google.maps.GeocoderStatus.OK) {
                        //console.log('Reverse', results);
                        if (results.length > 0) {
                            var r = results[0];
                            var a, types;
                            var parts = [];
                            var foundLocality = false;
                            var foundState = false;
                            for (var i = 0; i < r.address_components.length; i++) {
                                a = r.address_components[i];
                                types = a.types;
                                for (var j = 0; j < types.length; j++) {
                                    if (!foundLocality && types[j] == 'locality') {
                                        foundLocality = true;
                                        parts.push(a.long_name);
                                    } else if (!foundState && types[j] == 'administrative_area_level_1') {
                                        foundState = true;
                                        //parts.push(a.long_name);
                                    }
                                }
                            }
                            //console.log('Reverse', parts);
                            q.resolve(parts.join(' '));
                        }
                    } else {
                        //console.log('reverse fail', results, status);
                        q.reject(results);
                    }
                });

                return q.promise;
            },
            getLocation: function () {
                var q = $q.defer();

                navigator.geolocation.getCurrentPosition(function (position) {
                    q.resolve(position);
                }, function (error) {
                    q.reject(error);
                });

                return q.promise;
            }
        };
    })

    .factory('Flickr', function ($q, $resource, FLICKR_API_KEY) {
        var baseUrl = 'http://api.flickr.com/services/rest/';


        var flickrSearch = $resource(baseUrl, {
            method: 'flickr.groups.pools.getPhotos',
            group_id: '1463451@N25',
            safe_search: 1,
            jsoncallback: 'JSON_CALLBACK',
            api_key: FLICKR_API_KEY,
            format: 'json'
        }, {
            get: {
                method: 'JSONP'
            }
        });

        return {
            search: function (tags, lat, lng) {
                var q = $q.defer();
                flickrSearch.get({
                    tags: tags,
                    lat: lat,
                    lng: lng
                }, function (val) {
                    q.resolve(val);
                }, function (httpResponse) {
                    q.reject(httpResponse);
                });

                return q.promise;
            }
        };
    })

    .factory('Weather', function ($q, $resource, OPENWEATHER_API_KEY) {

        var baseUrl = 'http://api.openweathermap.org/data/2.5';

        var locationResource = $resource(baseUrl + '/weather', {
            callback: 'JSON_CALLBACK',
            APPID: OPENWEATHER_API_KEY
        }, {
            get: {
                method: 'JSONP'
            }
        });

        var forecastResource = $resource(baseUrl + '/forecast/daily', {
            callback: 'JSON_CALLBACK',
            APPID: OPENWEATHER_API_KEY
        }, {
            get: {
                method: 'JSONP'

            }
        });

        var hourlyResource = $resource(baseUrl + '/forecast', {
            callback: 'JSON_CALLBACK',
            APPID: OPENWEATHER_API_KEY
        }, {
            get: {
                method: 'JSONP'
            }
        });

        return {
            getForecast: function (lat, lng) {
                var q = $q.defer();

                forecastResource.get({
                    lat: lat, lon: lng
                }, function (resp) {
                    q.resolve(resp);
                }, function (httpResponse) {
                    q.reject(httpResponse);
                });

                return q.promise;
            },

            getHourly: function (lat, lng) {
                var q = $q.defer();

                hourlyResource.get({
                    lat: lat, lon: lng
                }, function (resp) {
                    q.resolve(resp);
                }, function (httpResponse) {
                    q.reject(httpResponse);
                });

                return q.promise;
            },

            getAtLocation: function (lat, lng) {
                var q = $q.defer();

                locationResource.get({
                    lat: lat, lon: lng
                }, function (resp) {
                    q.resolve(resp);
                }, function (error) {
                    q.reject(error);
                });

                return q.promise;
            }
        }
    })

    .factory('xively', function ($rootScope, Settings) {

        var _this = this;
        var feed_id = Settings.get('feedXively');

        var controlTypes = ['data', 'ctrlValue', 'ctrlSwitch'];

        $rootScope.datastreams = {};

        _this.prepareData = function (data) {
            data.isSetting = false;
            data.newValue = data.current_value;
            /* parse tags */
            if (angular.isDefined(data.tags)) {
                var tagString = null;
                var tags = null;
                for (var i in data.tags) {
                    (tagString === null) ? tagString = data.tags[i] : tagString = tagString + ' ,' + data.tags[i];
                }
                try {
                    tags = eval("({" + tagString + '})');
                } catch (e) {
                    data.type = 'undefined';
                }
                if (data.type != 'undefined') {
                    data.minDomain = tags.minValue;
                    data.maxDomain = tags.maxValue;
                    data.minCritical = tags.minCritical;
                    data.maxCritical = tags.maxCritical;
                    data.name = tags.name;
                    data.type = tags.type;
                }
            }
            return data;
        };


        _this.init = function (init) {

            var key = Settings.get('keyXively');
            feed_id = Settings.get('feedXively');

            xively.setKey(key);

            if (init) {
                $rootScope.datastreams = {};
                $rootScope.currentDataStream.data = [];
            }
            xively.datastream.list(feed_id, function (controls) {
                var xivelyControls = [];
                angular.forEach(controls, function (control) {
                    _this.prepareData(control);
                    if (_.contains(controlTypes, control.type)) {
                        xivelyControls.push(control);
                    }
                });
                $rootScope.$apply(function () {
                    $rootScope.dataPoints = xivelyControls;
                });
            });
        };


        $rootScope.$watch('dataPoints', function (v) {
            angular.forEach($rootScope.dataPoints, function (ds) {
                xively.datastream.get(feed_id, ds.id, function (data) {
                    //$rootScope.$apply(function () {
                    _this.prepareData(data);
                    $rootScope.datastreams[ds.id] = data;
                    //});
                    xively.datastream.subscribe(feed_id, ds.id, function (event, newData) {
                        _this.prepareData(newData);

                        $rootScope.$apply(function () {
                            $rootScope.datastreams[ds.id] = newData;
                        });

                        if (ds.id == $rootScope.currentDataStream.id) {
                            $rootScope.currentDataStream.id = newData.id;
                            $rootScope.currentDataStream.current_value = newData.current_value;
                            $rootScope.$apply(function () {
                                $rootScope.currentDataStream.data.push({ value: newData.current_value, at: newData.at });
                            });
                        }
                    });
                });
            });
            $rootScope.$broadcast('scroll.refreshComplete');
        });


        xively.refresh = function (init) {
            _this.init(init);
        };

        xively.setTimeScale = function (time) {
            Settings.set('timeScale', time);
            xively.get($rootScope.currentDataStream.id);
        };

        xively.getTimeScale = function () {
            return Settings.get('timeScale');
        };

        xively.publish = function (datapoint, value) {
            var send = {"current_value": value};
            xively.datastream.update(feed_id, datapoint, send, function (data) {
            })
        };

        xively.get = function (datapoint) {
            var duration = Settings.get('timeScale') + 'seconds';
            xively.datapoint.history(feed_id, datapoint, {duration: duration, interval: 10, limit: 1000}, function (data) {
                $rootScope.$apply(function () {
                    $rootScope.currentDataStream.id = datapoint;
                    $rootScope.currentDataStream.data = data;
                });
            })
        };

        return xively;
    })

    .factory('scandit', function ($rootScope, Settings, cordova, SCANDIT_API_KEY) {

        var _this = this;
        _this.init = function () {
        };

        return {
            scan: function (success, failure) {
                cordova.exec(success, failure, "ScanditSDK", "scan",
                    [SCANDIT_API_KEY,
                        {"beep": true,
                          "1DScanning": true,
                          "2DScanning": true}]);

            }
        };
    });
