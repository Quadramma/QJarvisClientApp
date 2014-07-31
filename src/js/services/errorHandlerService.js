var module = require('./_module_init.js');
module.factory('$QJErrorHandler', [
    '$QJLogger', '$state', '$timeout', '$rootScope',
    function($QJLogger, $state, $timeout, $rootScope) {
        var codes = {
            API_ERROR: 0, //CLIENT SIDE
            API_INVALID_RESPONSE: 1, //CLIENT SIDE
            API_RESPONSE_HAS_ERRORS: 2, //SERVER SIDE KNOWS
            API_TOKEN_EXPIRED: 3, //SERVER SIDE KNOWS
            API_INVALID_TOKEN: 4, //SERVER SIDE KNOWS
            API_INVALID_CREDENTIALS: 5, //SERVER SIDE KNOWS
            API_ROUTE_NOT_FOUND: 6, //SERVER SIDE KNOWS
            API_RESPONSE_HAS_ERRORS_WITHOUT_ERRORCODE: 7,
            API_INTERNAL_SERVER_ERROR: 500
        };
        var changeState = function(stateName) {
            $timeout(function() {
                $state.go(stateName);
            });
        };
        return {
            codes: codes,
            handle: function(code, response) {
                $rootScope.lastResponse = response;


                var vals = _.map(response, function(num, key) {
                    return num
                });
                var contactenedResponse = '';
                for (var x in vals) {
                    contactenedResponse += vals[x];
                }
                contactenedResponse = contactenedResponse.toString().replace(",", "");

                $rootScope.lastResponseAsString = vals;
                //$rootScope.lastResponseAsString = JSON.stringify(response);

                $rootScope.error = {
                    message: "Server API no accesible. Intente nuevamente mas tarde o conctacte a soporte."
                }

                switch (code) {
                    case codes.API_ERROR:
                        changeState("error-api");
                        break;
                    case codes.API_INTERNAL_SERVER_ERROR:
                        $rootScope.error.message = '(500) Internal server error. Intente nuevamente mas tarde o conctacte a soporte.';
                        changeState("error-api");
                        break;
                    case codes.API_INVALID_RESPONSE:
                        //changeState("error-invalid-response");
                        console.warn("INVALID RESPONSE -> " + JSON.stringify(response).toLowerCase().replace(/[^a-zA-Z]+/g, "."));
                        break;
                    case codes.API_RESPONSE_HAS_ERRORS:
                        //changeState("error-response-has-errors");
                        console.warn(response.message + " -> " + response.url);
                        break;
                    case codes.API_RESPONSE_HAS_ERRORS_WITHOUT_ERRORCODE:
                        $rootScope.error.message = "[API_RESPONSE_HAS_ERRORS_WITHOUT_ERRORCODE][Message-> " + response.message + "]";
                        changeState("error-response-has-errors");
                        break;
                    case codes.API_TOKEN_EXPIRED:
                        $rootScope.error.message = 'Su session expiro';
                        changeState("login");
                        break;
                    case codes.API_INVALID_TOKEN:
                        $rootScope.error.message = 'Token invalid';
                        changeState("login");
                        break;
                    case codes.API_INVALID_CREDENTIALS:
                        $rootScope.error.message = "Credenciales invalidas";
                        changeState("login");
                        break;
                    case codes.API_ROUTE_NOT_FOUND:
                        $rootScope.error.message = response.message;
                        //changeState("error-response-has-errors");
                        //$QJLogger.log("API_ROUTE_NOT_FOUND->"+response.message);
                        console.warn(response.message + " -> " + response.url);
                        break;
                    default:
                        console.info("[QJErrorHandler][UNKNOW ERROR][CONTACT SUPPORT]");
                        break
                }
            }
        }
    }
]);