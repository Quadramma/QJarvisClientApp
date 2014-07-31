var module = require('./_module_init.js');
module.factory('$QJCFilter', [
	'$QJLogger', '$rootScope', '$state', '$timeout', '$QJLocalSession', '$QJAuth',
	function($QJLogger, $rootScope, $state, $timeout, $QJLocalSession, $QJAuth) {
		var self = {
			fields: {}
		};

		function getBindedArray(arrayName, $scope, obj, index) {
			if (index == 0) {
				$QJLogger.log('QJCFilter -> getBindedArray -> something went wrong and i abort the recursive func bro!');
			}
			if (!_.isUndefined(obj) && _.isNull(obj)) {
				return obj;
			}
			if (arrayName.toString().split('.').length == 1 || index == 0) {
				//console.info(arrayName);
				if (!_.isUndefined(obj)) {
					return obj[arrayName] || null;
				} else {
					//console.info('return this ->'+arrayName);
					//console.info($scope[arrayName]);
					return $scope[arrayName] || null;
				}

			} else {
				var firstPart = arrayName.toString().split('.')[0];
				var rest = arrayName.substring(firstPart.length + 1);
				//console.info(arrayName);
				return getBindedArray(rest, $scope, $scope[firstPart], (_.isUndefined(index) ? 20 : index--));
			}

		};
		return {
			create: function(settings, $scope) {
				_.each(settings.fields, function(field, key) {
					self.fields[field.name] = null;
				});

				//defaults
				settings.filteredfieldName = settings.filteredfieldName || '_qjfiltered';

				//stores settings as property
				self.settings = settings;
				$scope[settings.name] = self;

				self.filter = function() {
					//console.clear();
					containValidationSuccessItemsKeys = [];
					_.each(self.fields, function(val, key) {
						var keyWhoChanges = key; //updates based on all filters ! fix
						var newFieldValue = val;
						_.each(settings.fields, function(field, key) {
							if (keyWhoChanges !== field.name) return; //take only the one who changes
							var bindedArray = getBindedArray(field.arrayName, $scope);
							if (bindedArray !== null) {
								_.each(bindedArray, function(bindedArrayItem, bindedArrayItemKey) {
									bindedArrayItemHasSuccessAny = (null != _.find(containValidationSuccessItemsKeys, function(val) {
										return val == bindedArrayItemKey
									}));
									if (bindedArrayItemHasSuccessAny) {
										return; // jump because alredy succes validation and it not gonna be filtered
									}
									var containValidationResponse = [];
									_.each(field.bindTo, function(bindToField, key) {
										var _field = bindedArrayItem[bindToField];
										if (!_.isUndefined(_field)) {
											if (_field !== null) {
												var flag = true;
												if (_.isUndefined(newFieldValue) || _.isNull(newFieldValue) || newFieldValue == "") {
													return; // jump because filter field is empty!
												} else {
													var indexof = _field.toString().toLowerCase().indexOf(newFieldValue.toString().toLowerCase());
													if (indexof !== -1) {
														flag = true;
													} else {
														flag = false;
													}
												}
												containValidationResponse.push(flag);

											} else {
												$QJLogger.log("QJCFilter -> Warning -> bindedArrayItem " + bindToField + " at index " + bindedArrayItemKey + " is null so its omited from filtering");
											}
										} else {
											$QJLogger.log("QJCFilter -> Warning -> bindedArrayItem " + bindToField + " do not exists in " + field.arrayName);
										}
									});
									var passContainValidation = (null != _.find(containValidationResponse, function(val) {
										return val == true
									}));
									bindedArrayItem[settings.filteredfieldName] = !passContainValidation;
									if (containValidationResponse.length == 0) {
										bindedArrayItem[settings.filteredfieldName] = false; //no hubo respuestas por lo tanto no se filtra
									}
									if (bindedArrayItem[settings.filteredfieldName]) {
										containValidationSuccessItemsKeys.push(bindedArrayItemKey); //si se filtra una ves jump para el resto
									}
								});
							} else {
								$QJLogger.log("QJCFilter -> Warning -> arrayName " + field.arrayName + " for filter field " + field.name + " do not exists on the scope");
							}
						});
					});
					$scope.$emit('qjcfilter.update', {
						filteredfieldName: settings.filteredfieldName
					});
				};
				$scope.$watch(settings.name + '.fields', function(newValue, oldValue) {
					self.filter();
				}, true);
			}
		}
	}
]);