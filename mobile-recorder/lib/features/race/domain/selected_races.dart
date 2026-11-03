import 'dart:async';

import 'package:clock/clock.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series_service.dart';
import 'package:sailbrowser_flutter/util/list_extensions.dart';

/// Races selected to run.
/// This always includes races scheduled for today plus any manually added by the user.
class SelectedRaceIds extends StateNotifier<Iterable<String>> {
  SelectedRaceIds() : super([]);

  void addRace(List<String> ids) {
    state = [...state, ...ids].unique((id) => id);
  }

  void removeRace(String removedId) {
    state = state.where((id) => removedId != id).toList();
  }
}

final selectedRaceIdsProvider =
    StateNotifierProvider<SelectedRaceIds, Iterable<String>>(
  (ref) {
    return SelectedRaceIds();
  },
);

/// Races selected to run.
/// This always includes races scheduled for today plus any manually added by the user.
final selectedRacesProvider = Provider<List<AllRaceData>>((ref) {
  final selectedIDs = ref.watch(selectedRaceIdsProvider);
  final races = ref.watch(allRaceDataProvider);

  return races.map<List<AllRaceData>>(
      data: (data) => data.value
          .where((d) =>
              selectedIDs.contains(d.race.id) ||
              _isToday(d.race.scheduledStart))
          .toList(),
      error: (error) => [],
      loading: (loading) => []);
});

bool _isToday(DateTime test) {
  final now = clock.now();
  return (test.year == now.year &&
      test.month == now.month &&
      test.day == now.day);
}

/// Emits when
/// * stream is created
/// * at 00:00 on the next day
/// * at 00:00 thereafter
final dateChangeProvider = StreamProvider<int>((ref) async* {
  // Fire first event immidatly
  int count = 0;
  yield count;

  // wait for 00:00 tommorow
  final now = clock.now();
  final target =
      DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
  await Future.delayed(target.difference(now));

  // Loop forever sending events each day
  while (true) {
    count++;
    yield count;
    await Future.delayed(const Duration(days: 1));
  }
});
