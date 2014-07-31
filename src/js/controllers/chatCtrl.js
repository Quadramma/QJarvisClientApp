var module = require('./_module_init.js');
module.controller('ChatController', function(
	$QJCCombobox, $QJCSelectkey, $QJCListview, $QJCFilter, $QJLogger, $QJHelperFunctions, $scope, $rootScope, $QJLoginModule, $QJApi, $timeout, $state, $QJLoginModule
) {
	$QJLogger.log("ChatController -> initialized");


	$scope.breadcrumb = {
		name: 'Chat',
		list: [
			//{name:'None2',state:'',fa:'fa-dashboard'}
		],
		active: "Chat"
	};


	$scope.input = "";
	$scope.items = [{
		sender: "Pepe",
		message: "Blabla"
	}, {
		sender: "Pepe 2",
		message: "Blabla"
	}];



	/*
		var obj = JSON.parse(e.data);
		console.info(obj);
		$timeout(function(){
			$scope.$apply(function(){
				$scope.items.push(obj);
			});
		});
	*/


	$scope.enter = function() {
		var newItem = {
			loginname: $rootScope.session.loginname,
			message: $scope.input
		};
		$scope.items.unshift(newItem);
		$scope.input = "";
		//
		$QJApi.getController('chat').post({
			action: 'save'
		}, {
			message: newItem.message,
			_chat_id: 1
		}, function(res) {
			$QJLogger.log("ChatController -> POST chat save -> success");
			update();
		});
	};



	function update() {
		$QJApi.getController('chat').get({
			action: 'list'
		}, function(res) {
			$QJLogger.log("ChatController -> GET chat list -> success");
			$scope.items = _.sortBy(res.items, function(item) {
				return item._id * -1;
			});
			console.info(res.items);
		});
	}
	update();

	var myVar = setInterval(update, 5000);

	$rootScope.$on('$stateChangeStart',
		function(event, toState, toParams, fromState, fromParams) {

			if (fromState.name === "module-chat") {
				clearInterval(myVar);
			}

		});

})
