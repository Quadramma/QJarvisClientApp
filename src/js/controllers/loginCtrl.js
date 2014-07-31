var module = require('./_module_init.js');
module.controller('LoginController', function(
    $QJLogger,
    $scope, $rootScope, $QJLoginModule, $timeout, $QJHelperFunctions) {
    $QJLogger.log('LoginController');

    $scope.loginnameRequired = false;
    $scope.passwordRequired = false;

    setTimeout(function() {
        $rootScope.error = {
            message: ""
        };
    }, 4000);


    $scope.classForPassword = function() {
        return 'form-group ' + ($scope.passwordRequired ? 'has-error' : '');
    };

    $scope.invalidCredentials = function() {
        console.info("[QJarvisAppLoginController]->[InvalidCredentials]");
        $scope.showError("Credenciales invalidas");
    };

    $scope.showError = function(errorMessage) {
        $rootScope.error = {
            message: errorMessage
        };
        setTimeout(function() {
            $rootScope.message = '';
        }, 5000);
    };

    $scope.validateFields = function(success) {
        if (_.isUndefined($scope.loginname) || $scope.loginname == "") {
            console.info("[]->[loginname required]");
            $scope.showError("Usuario requerido");
        } else {
            if (_.isUndefined($scope.password) || $scope.password == "") {
                console.info("[]->[password required]");
                $scope.showError("Password requerida");
            } else {
                success();
            }
        }
    };

    $scope.submit = function() {
        $scope.validateFields(function() {
            $QJLoginModule.login($scope.loginname, $scope.password, function() {
                $QJHelperFunctions.changeState('home');
            });
        });
    };
});