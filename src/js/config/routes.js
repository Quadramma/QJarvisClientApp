var module = require('./_module_init.js');
module.config(function($stateProvider, $urlRouterProvider, $httpProvider) {
	delete $httpProvider.defaults.headers.common['X-Requested-With'];
	$urlRouterProvider.otherwise('/home'); //DEFAULT
});

module.run([
	'$QJHelperFunctions', '$QJLogger', '$QJApi', '$rootScope', '$location', '$urlRouter', '$state', '$timeout',
	function($QJHelperFunctions, $QJLogger, $QJApi, $rootScope, $location, $urlRouter, $state, $timeout) {

		$rootScope.$on('$stateChangeStart', function(event, toState, toParams, fromState, fromParams) {
			//
			var logged = $rootScope.session.token != null;
			if (toState.name != "login" && !logged) {
				$QJLogger.log('run -> state -> force redirection');
				event.preventDefault();
				$QJHelperFunctions.changeState('login');
			}
			//
		});

	}
]);

module.config(function($stateProvider, $urlRouterProvider, $httpProvider) {

console.info('[ROUTES]');

	$stateProvider
	.state('home', {
		url: '^/home',
		views: {
			'': {
				templateUrl: 'pages/home.html',
				controller: 'HomeController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})

	.state('login', {
		url: '^/login',
		views: {
			'': {
				templateUrl: 'pages/login.html',
				controller: 'LoginController'
			},
			'nav': {
				templateUrl: 'pages/empty_nav.html'
			},
			'sidebar': {
				templateUrl: 'pages/empty.html'
			}
		}
	})



	.state('error-response-has-errors', {
		url: '^/apierrorinvalidresponse',
		views: {
			'': {
				templateUrl: 'pages/errors/api.response.has.errors.html'
			},
			'nav': {
				templateUrl: 'pages/empty_nav.html'
			},
			'sidebar': {
				templateUrl: 'pages/empty.html'
			}
		}
	})

	.state('error-invalid-response', {
		url: '^/apierrorinvalidresponse',
		views: {
			'': {
				templateUrl: 'pages/errors/api.invalid.response.html'
			},
			'nav': {
				templateUrl: 'pages/empty_nav.html'
			},
			'sidebar': {
				templateUrl: 'pages/empty.html'
			}
		}
	})

	.state('error-api', {
		url: '^/apierror',
		views: {
			'': {
				templateUrl: 'pages/errors/api.html'
			},
			'nav': {
				templateUrl: 'pages/empty_nav.html'
			},
			'sidebar': {
				templateUrl: 'pages/empty.html'
			}
		}
	})


	//MENUS
	.state('module-menu-list', {
		url: '^/menus',
		views: {
			'': {
				templateUrl: 'pages/menu/menu.list.html',
				controller: 'MenuListController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})
		.state('module-menu-edit', {
			url: '^/menu/:id',
			views: {
				'': {
					templateUrl: 'pages/menu/menu.edit.html',
					controller: 'MenuEditController'
				},
				'nav': {
					templateUrl: 'pages/nav.html',
					controller: 'NavController'
				},
				'sidebar': {
					templateUrl: 'pages/sidebar.html',
					controller: 'SidebarController'
				}
			}
		})


	.state('module-profile-list', {
		url: '^/profiles',
		views: {
			'': {
				templateUrl: 'pages/profile/profile.list.html',
				controller: 'ProfileListController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})
		.state('module-profile-edit', {
			url: '^/profiles/:id',
			views: {
				'': {
					templateUrl: 'pages/profile/profile.edit.html',
					controller: 'ProfileEditController'
				},
				'nav': {
					templateUrl: 'pages/nav.html',
					controller: 'NavController'
				},
				'sidebar': {
					templateUrl: 'pages/sidebar.html',
					controller: 'SidebarController'
				}
			}
		})

	.state('module-usergroup-list', {
		url: '^/usergroups',
		views: {
			'': {
				templateUrl: 'pages/users/usergroup.list.html',
				controller: 'UsergroupListController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})
		.state('module-usergroup-edit', {
			url: '^/usergroups/:id',
			views: {
				'': {
					templateUrl: 'pages/users/usergroup.edit.html',
					controller: 'UsergroupEditController'
				},
				'nav': {
					templateUrl: 'pages/nav.html',
					controller: 'NavController'
				},
				'sidebar': {
					templateUrl: 'pages/sidebar.html',
					controller: 'SidebarController'
				}
			}
		})



	.state('module-user-list', {
		url: '^/users',
		views: {
			'': {
				templateUrl: 'pages/users/users.list.html',
				controller: 'UserListController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})
		.state('module-user-edit', {
			url: '^/user/:id',
			views: {
				'': {
					templateUrl: 'pages/users/users.edit.html',
					controller: 'UserEditController'
				},
				'nav': {
					templateUrl: 'pages/nav.html',
					controller: 'NavController'
				},
				'sidebar': {
					templateUrl: 'pages/sidebar.html',
					controller: 'SidebarController'
				}
			}
		})

	.state('module-user-myprofile-edit', {
		url: '^/myprofile/:id',
		views: {
			'': {
				templateUrl: 'pages/users/users.myprofile.edit.html',
				controller: 'UserEditController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})

	.state('module-project-list', {
		url: '^/project',
		views: {
			'': {
				templateUrl: 'pages/project/project.list.html',
				controller: 'ProjectListController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})
		.state('module-project-edit', {
			url: '^/project/:id',
			views: {
				'': {
					templateUrl: 'pages/project/project.edit.html',
					controller: 'ProjectEditController'
				},
				'nav': {
					templateUrl: 'pages/nav.html',
					controller: 'NavController'
				},
				'sidebar': {
					templateUrl: 'pages/sidebar.html',
					controller: 'SidebarController'
				}
			}
		})

	.state('module-project-hours-list', {
		url: '^/projecthours',
		views: {
			'': {
				templateUrl: 'pages/project/project.hours.list.html',
				controller: 'ProjectHoursListController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})
		.state('module-project-hours-edit', {
			url: '^/projecthours/:id',
			views: {
				'': {
					templateUrl: 'pages/project/project.hours.edit.html',
					controller: 'ProjectHoursEditController'
				},
				'nav': {
					templateUrl: 'pages/nav.html',
					controller: 'NavController'
				},
				'sidebar': {
					templateUrl: 'pages/sidebar.html',
					controller: 'SidebarController'
				}
			}
		})


	.state('module-settings', {
		url: '^/settings',
		views: {
			'': {
				templateUrl: 'pages/settings/qj.settings.html',
				controller: 'QJBackendSettingsController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})


	.state('module-vipster-settings', {
		url: '^/vipster/settings',
		views: {
			'': {
				templateUrl: 'pages/vipster/vipster.settings.html',
				controller: 'VipsterConfigController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})

	.state('module-chat', {
		url: '^/chat',
		views: {
			'': {
				templateUrl: 'pages/chat/chat.main.html',
				controller: 'ChatController'
			},
			'nav': {
				templateUrl: 'pages/nav.html',
				controller: 'NavController'
			},
			'sidebar': {
				templateUrl: 'pages/sidebar.html',
				controller: 'SidebarController'
			}
		}
	})



	;
});