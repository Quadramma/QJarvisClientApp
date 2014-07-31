var module = require('./_module_init.js');
module.controller('SidebarController', function(
    $QJLogger, $scope, $rootScope, $QJLoginModule, $QJLocalSession, $QJConfig, $QJApi) {
    $QJLogger.log("SidebarController -> initialized");

    function getNodesForCurrentToken() {
        //Siempre que carga el sidebar recupera el menu para el usuario
        $QJApi.getController('module').get({
            action: 'menu'
        }, function(res) {
            $QJLogger.log("SidebarController -> api get -> module menu -> success");
            //console.info(res);
            $scope.modules = res.modules;
        });
    }

    $rootScope.$on('session.change', function(args1, args2) {
        getNodesForCurrentToken();
    });

    getNodesForCurrentToken();
});