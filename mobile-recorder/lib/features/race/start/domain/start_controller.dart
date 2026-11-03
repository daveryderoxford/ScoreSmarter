import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series_service.dart';
import 'package:sailbrowser_flutter/features/race/domain/selected_races.dart';

typedef StartRecord = ({DateTime date, int order, List<Race> races});

/// List of future starts for the currently selected races.
/// Includes starts that are in progress
class StartList {
  late final List<AllRaceData> currentRaces;
  late final List<StartRecord> starts;

  StartList(List<AllRaceData> currentRaces) {
    final futureRaces = currentRaces
        .map((r) => r.race)
        .where((r) =>
            r.status == RaceStatus.future || r.status == RaceStatus.postponed)
        .toList();

    starts = _groupByStart(futureRaces);
  }

  List<StartRecord> _groupByStart(List<Race> races) {
    final starts = <StartRecord>[];

    DateTime date = DateTime(0, 0, 0);
    int raceOfDay = 0;

    for (var race in races) {
      if (date != race.scheduledStart || raceOfDay != race.raceOfDay) {
        starts.add((
          date: race.scheduledStart,
          order: race.raceOfDay,
          races: [race],
        ));
        date = race.scheduledStart;
        raceOfDay = race.raceOfDay;
      } else {
        starts.last.races.add(race);
      }
    }
    return starts;
  }
}

/// List of future starts for the currently selected races.
/// Includes starts that are in progress
final startListProvider = Provider<List<StartRecord>>((ref) {
  final raceData = ref.watch(selectedRacesProvider);
  return StartList(raceData).starts;
});
