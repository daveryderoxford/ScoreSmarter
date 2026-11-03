import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sailbrowser_flutter/features/club/domain/clubs_service.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series.dart';

class HomeRaceListItem extends ConsumerWidget {
  final Race race;

  const HomeRaceListItem(this.race, {super.key});

  @override
  Widget build(BuildContext context, ref) {
    final currectClub = ref.watch(currentClubProvider);
    final fleet =
        currectClub.current.fleets.firstWhere((f) => (f.id == race.fleetId));

    return ListTile(
      title: Text(race.name),
      subtitle: Row(
        children: [
          Text('Fleet: ${fleet.name}'),
          const SizedBox(width: 25),
          Text('Start number: ${race.raceOfDay.toString()}'),
        ],
      ),
    );
  }
}
