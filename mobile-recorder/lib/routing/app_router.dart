import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:sailbrowser_flutter/app_shell/app_shell.dart';
import 'package:sailbrowser_flutter/features/admin/admin_screen.dart';
import 'package:sailbrowser_flutter/features/authentication/presentation/tenant_select_screen.dart';
import 'package:sailbrowser_flutter/features/club/presentation/boat_screen.dart';
import 'package:sailbrowser_flutter/features/race-calendar/presentation/series_detail.dart';
import 'package:sailbrowser_flutter/features/race-calendar/presentation/series_screen.dart';
import 'package:sailbrowser_flutter/features/home/presentation/home_screen.dart';
import 'package:sailbrowser_flutter/features/race/entry/presentation/entries_screen.dart';
import 'package:sailbrowser_flutter/features/results/presentation/results_screen.dart';
import 'package:sailbrowser_flutter/features/results/presentation/results_slideshow.dart';
import '../features/race/finish/presentation/finish_screen.dart';
import '../features/race/start/presentation/start_screen.dart';
import './go_router_refresh_stream.dart';
import '../features/authentication/data/firebase_auth_repository.dart';
import '../features/authentication/presentation/custom_profile_screen.dart';
import '../features/authentication/presentation/custom_sign_in_screen.dart';

part 'app_router.g.dart';

// private navigators
final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _homeNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'home');
final _entriesNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'entries');
final _startNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'start');
final _finishNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'finish');
final _resultsNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'results');
final _adminNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'admin');

enum AppRoute {
  tenantSelection,
  signIn,
  home,
  entry,
  start,
  finish,
  results,
  resultsSlideShow,
  admin,
  profile,
  boats,
  series,
  seriesDetail,
}

@riverpod
// ignore: unsupported_provider_value
GoRouter goRouter(GoRouterRef ref) {
  final authRepository = ref.watch(authRepositoryProvider);
  return GoRouter(
      initialLocation: '/tenantSelection',
      navigatorKey: _rootNavigatorKey,
      debugLogDiagnostics: true,
      redirect: (context, state) {
        final path = state.uri.path;
        final isLoggedIn = authRepository.currentUser != null;
        if (isLoggedIn) {
          if (path.startsWith('/signIn') ||
              path.startsWith('/tenantSelection')) {
            return '/home';
          }
        } else {
          if (path.startsWith('/home') ||
              path.startsWith('/entry') ||
              path.startsWith('/start') ||
              path.startsWith('/finish') ||
              path.startsWith('/results') ||
              path.startsWith('/admin')) {
            return '/tenantSelection';
          }
        }
        return null;
      },
      refreshListenable:
          GoRouterRefreshStream(authRepository.authStateChanges()),
      routes: [
        GoRoute(
          path: '/tenantSelection',
          name: AppRoute.tenantSelection.name,
          pageBuilder: (context, state) => const NoTransitionPage(
            child: TenantSelectScreen(),
          ),
        ),
        GoRoute(
          path: '/signIn',
          name: AppRoute.signIn.name,
          pageBuilder: (context, state) => const NoTransitionPage(
            child: CustomSignInScreen(),
          ),
        ),
        // Stateful navigation based on:
        // https://github.com/flutter/packages/blob/main/packages/go_router/example/lib/stateful_shell_route.dart
        StatefulShellRoute.indexedStack(
          builder: (context, state, navigationShell) {
            return AppShell(navigationShell: navigationShell);
          },
          branches: [
            StatefulShellBranch(
                navigatorKey: _homeNavigatorKey, routes: homeRoutes()),
            StatefulShellBranch(
                navigatorKey: _entriesNavigatorKey, routes: entriesRoutes()),
            StatefulShellBranch(
                navigatorKey: _startNavigatorKey, routes: startRoutes()),
            StatefulShellBranch(
                navigatorKey: _finishNavigatorKey, routes: finishRoutes()),
            StatefulShellBranch(
                navigatorKey: _resultsNavigatorKey, routes: resultsRoutes()),
            StatefulShellBranch(
                navigatorKey: _adminNavigatorKey, routes: adminRoutes()),
            //errorBuilder: (context, state) => const NotFoundScreen(),
          ],
        )
      ]);
}

homeRoutes() {
  return [
    GoRoute(
      path: '/home',
      name: AppRoute.home.name,
      pageBuilder: (context, state) => const NoTransitionPage(
        child: HomeScreen(),
      ),
      routes: [
        GoRoute(
          path: 'profile',
          name: AppRoute.profile.name,
          pageBuilder: (context, state) => const NoTransitionPage(
            child: CustomProfileScreen(),
          ),
        )
      ],
    ),
  ];
}

entriesRoutes() {
  return [
    GoRoute(
        path: '/entries',
        name: AppRoute.entry.name,
        pageBuilder: (context, state) => const NoTransitionPage(
              child: EntriesScreen(),
            ))
  ];
}

startRoutes() {
  return [
    GoRoute(
        path: '/start',
        name: AppRoute.start.name,
        pageBuilder: (context, state) => const NoTransitionPage(
              child: StartScreen(),
            ))
  ];
}

finishRoutes() {
  return [
    GoRoute(
      path: '/finish',
      name: AppRoute.finish.name,
      pageBuilder: (context, state) => const NoTransitionPage(
        child: FinishScreen(),
      ),
    )
  ];
}

resultsRoutes() {
  return [
    GoRoute(
      path: '/results',
      name: AppRoute.results.name,
      pageBuilder: (context, state) => NoTransitionPage(
        child: ResultsScreen(),
      ),
      routes: [
        GoRoute(
          path: 'resultsslideShow',
          name: AppRoute.resultsSlideShow.name,
          pageBuilder: (context, state) => const NoTransitionPage(
            child: ResultsSlideShow(),
          ),
        )
      ],
    )
  ];
}

adminRoutes() {
  return [
    GoRoute(
        path: '/admin',
        name: AppRoute.admin.name,
        pageBuilder: (context, state) => NoTransitionPage(
              child: AdminScreen(),
            ),
        routes: [
          GoRoute(
            path: 'boats',
            name: AppRoute.boats.name,
            pageBuilder: (context, state) => const NoTransitionPage(
              child: BoatsScreen(),
            ),
          ),
          GoRoute(
            path: 'series',
            name: AppRoute.series.name,
            pageBuilder: (context, state) => const NoTransitionPage(
              child: SeriesScreen(),
            ),
          ),
          GoRoute(
            path: 'series_detail',
            name: AppRoute.seriesDetail.name,
            builder: (context, state) {
              final id = state.extra as String;
              return SeriesDetailScreen(id);
            },
          ),
        ]),
  ];
}
