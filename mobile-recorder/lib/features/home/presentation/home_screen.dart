import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:sailbrowser_flutter/common_widgets/responsive_center.dart';
import 'package:sailbrowser_flutter/features/authentication/data/firebase_auth_repository.dart';
import 'package:sailbrowser_flutter/features/home/presentation/home_race_list_item.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series_service.dart';
import 'package:sailbrowser_flutter/features/race/domain/selected_races.dart';
import 'package:sailbrowser_flutter/routing/app_router.dart';

import 'eager_initialisation.dart';

enum UserMenuOptions { logout, profile }

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    //  final ButtonStyle textButtonStyle = TextButton.styleFrom(
    //   foregroundColor: Theme.of(context).colorScheme.onPrimary,
    //  );
    /// Early initilaised providers
    ref.watch(allRacesProvider);

    return EagerInitialization(
      child: Scaffold(
        appBar: AppBar(title: const Text('Home'), actions: <Widget>[
          _buildUserMenuButton(context, ref),
        ]),
        body: ResponsiveCenter(
          maxContentWidth: 600,
          child: SelectedRacesCard(context: context, ref: ref),
        ),
      ),
    );
  }

  _doLogout(BuildContext context, WidgetRef ref) async {
    await ref.read(firebaseAuthProvider).signOut();
    // ignore: use_build_context_synchronously
    context.goNamed(AppRoute.tenantSelection.name);
  }

  Widget _buildUserMenuButton(BuildContext context, WidgetRef ref) {
    return PopupMenuButton<UserMenuOptions>(
      icon: const Icon(Icons.person_2_outlined),
      onSelected: (item) {
        return switch (item) {
          UserMenuOptions.profile => context.goNamed(AppRoute.profile.name),
          UserMenuOptions.logout => _doLogout(context, ref)
        };
      },
      itemBuilder: (BuildContext context) => <PopupMenuEntry<UserMenuOptions>>[
        const PopupMenuItem<UserMenuOptions>(
          value: UserMenuOptions.logout,
          child: Text('Logout'),
        ),
        const PopupMenuItem<UserMenuOptions>(
          value: UserMenuOptions.profile,
          child: Text('User details'),
        ),
      ],
    );
  }
}

class SelectedRacesCard extends StatelessWidget {
  const SelectedRacesCard({
    super.key,
    required this.context,
    required this.ref,
  });

  final BuildContext context;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final raceData = ref.watch(selectedRacesProvider);

    return Card(
      child: Column(
        children: [
          ListTile(
            title: const Center(child: Text('Races Today')),
            trailing: IconButton(
              onPressed:
                  () {}, // TODO impleemnt dialog to allow additional races ot be added to the current races
              icon: const Icon(Icons.add),
            ),
          ),
          (raceData.isEmpty)
              ? const Center(
                  child: Text(textScaleFactor: 1.2, 'No races today'),
                )
              : Expanded(
                  child: ListView(
                    children: raceData
                        .map((rd) => HomeRaceListItem(rd.race))
                        .toList(),
                  ),
                ),
        ],
      ),
    );
  }
}
