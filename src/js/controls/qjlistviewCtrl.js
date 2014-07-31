var module = require('./_module_init.js');
module.factory('$QJCListview', [
	'$QJApi', '$QJHelperFunctions', '$QJLogger', '$rootScope', '$state', '$timeout', '$QJLocalSession', '$QJAuth',
	function($QJApi, $QJHelperFunctions, $QJLogger, $rootScope, $state, $timeout, $QJLocalSession, $QJAuth) {


		function createPagedList(items, entriesPerPage) {
			var pagesCounter = 1;
			var pages = [];
			//
			var _currItemIndex = 0;
			var _currPage = [];
			while (_currItemIndex < items.length) { //ej: 0 < 5
				if (_currPage.length < entriesPerPage) {
					_currPage.push(items[_currItemIndex]);
					_currItemIndex++;
				} else {
					pages.push(_currPage);
					_currPage = [];
					pagesCounter++;
				}
			}
			if (_currPage.length > 0) {
				pages.push(_currPage);
			}
			return pages;
		}

		function buildListViewData(items) {
			var entriesPerPage = $rootScope.config.listviewEntriesPerPage; //ej: 2   
			var pages = [];
			if (!_.isUndefined(items)) {
				pages = createPagedList(items, entriesPerPage);
			}
			var pageNumbers = [];
			_.each(pages, function(e, index) {
				pageNumbers.push(index + 1);
			});
			var _lvData = {
				currentPageIndex: 0,
				currentPage: pages[0],
				totalPages: pages.length,
				totalItems: items.length,
				pages: pages,
				pagination: {
					pageNumbers: pageNumbers,
					disabledForPrevLink: function() {
						return _lvData.currentPageIndex === 0 ? true : false;
					},
					disabledForNextLink: function() {
						return _lvData.currentPageIndex >= pages.length - 1 ? true : false;
					},
					activeForLink: function(pageNumber) {
						if ((pageNumber === _lvData.currentPageIndex + 1)) {
							return true;
						} else {
							return false;
						}
					},
					goto: function(pageNumber) {
						_lvData.currentPageIndex = pageNumber - 1;
						_lvData.currentPage = pages[_lvData.currentPageIndex];
					},
					next: function() {
						_lvData.currentPageIndex++;
						if (_lvData.currentPageIndex >= pages.length) {
							_lvData.currentPageIndex = pages.length - 1;
						}
						_lvData.currentPage = pages[_lvData.currentPageIndex];
					},
					prev: function() {
						_lvData.currentPageIndex--;
						if (_lvData.currentPageIndex <= 0) {
							_lvData.currentPageIndex = 0;
						}
						_lvData.currentPage = pages[_lvData.currentPageIndex];
					}
				}
			};
			return _lvData;
		}
		return {
			create: function(settings, $scope) {
				//instance private
				function render(items) {
					$scope[settings.pagedDataArray] = buildListViewData(items);
				}



				//watch
				$scope.$watch(settings.dataArray, function(newValue, oldValue) {

					if (_.isUndefined($scope[settings.dataArray])) {
						$QJLogger.log("WARNING: QJCListview -> " + settings.dataArray + " -> " + " dataArray undefined");
						return;
					}

					$scope[settings.pagedDataArray] = buildListViewData($scope[settings.dataArray]);
					render($scope[settings.dataArray]);
				});


				$scope.$on('qjcfilter.update', function(args1, args2) {
					$scope.$emit(settings.name + ".update", {});
					var filteredData = _.filter($scope[settings.dataArray], function(item) {
						return !item[args2.filteredfieldName];
					});
					render(filteredData);

					var filteredCount = _.filter($scope[settings.dataArray], function(item) {
						return item[args2.filteredfieldName] == true;
					});
					$scope.$emit('qjclistview.filter.success', {
						filteredCount: filteredCount
					});

				});

				var self = settings;
				$scope[settings.name] = self;

				self.update = function() {
					//DB
					$QJApi.getController(settings.api.controller).get(settings.api.params, function(res) {
						$QJLogger.log("QJCListview -> " + settings.api.controller + " " + settings.api.params.action + " -> success");
						$scope[settings.dataArray] = res.items;
						$scope.$emit(settings.name + ".update", {});
						//console.info($scope[settings.dataArray]);
					});
					//$scope.$emit(settings.name+".update",{});
				};
				self.update();


			}
		};
	}
]);


module.directive('qjclistview', function() {
	var directive = {};
	directive.restrict = 'E'; /* restrict this directive to elements */
	directive.templateUrl = "pages/controls/qjclistview.html";
	directive.scope = {
		data: "=",
		lvw: "="
	}
	directive.compile = function(element, attributes) {
		var linkFunction = function($scope, element, attributes) {}
		return linkFunction;
	}
	return directive;
});