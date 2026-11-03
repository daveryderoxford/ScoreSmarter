import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series.dart';
import 'package:sailbrowser_flutter/features/race/domain/race_competitor.dart';
import 'package:sailbrowser_flutter/features/race/domain/race_competitor_service.dart';
import 'package:sailbrowser_flutter/features/race/domain/result_code.dart';
import 'package:sailbrowser_flutter/features/race/domain/selected_races.dart';
import 'package:sailbrowser_flutter/util/list_extensions.dart';

/// Competitors for races thta are currently in progress.
/// Takes a parameter to return competitors thta have finished or not.
final racingCompetitorsProvider =
    Provider.family<List<RaceCompetitor>, bool>((ref, bool racing) {
  final competitors = ref.watch(currentCompetitors).valueOrNull;
  if (competitors == null) return [];

  // Get races in progress
  final raceData = ref.watch(selectedRacesProvider);

  final raceIds = raceData
      .where((data) => data.race.status == RaceStatus.inProgress)
      .map((data) => data.race.id);

  if (racing) {
    return competitors
        .where((comp) =>
            comp.resultCode == ResultCode.notFinished &&
            raceIds.contains(comp.raceId))
        .toList();
  } else {
    return competitors
        .where((comp) =>
            comp.resultCode != ResultCode.notFinished &&
            raceIds.contains(comp.raceId))
        .toList();
  }
});

/// Competitors approaching the finish - selected by the race officer.
class PinnedCompetitors extends StateNotifier<List<RaceCompetitor>> {
  final List<RaceCompetitor> competitors;

  PinnedCompetitors(this.competitors) : super(<RaceCompetitor>[]);

  void addId(String id) {
    final comp = competitors.firstWhere((c) => c.id == id);
    state = [...state, comp].unique((comp) => comp.id);
  }

  void removeId(String id) {
    state = state.where((comp) => id != comp.id).toList();
  }
}

final pinnedCompetitorsProvider = StateNotifierProvider(
  (ref) => PinnedCompetitors(ref.watch(racingCompetitorsProvider(true))),
);

typedef CompFilter = ({String boatClass, String sailNumber});

class CompFilterNotifier extends Notifier<CompFilter> {

  static const unsetClass = "UNSET";

  @override
  build() => (boatClass: unsetClass, sailNumber: "");

  set boatClass(String? b) {
    b ??= unsetClass;
    state = (boatClass: b, sailNumber: state.sailNumber);
  }

  set sailNumber(String? s) {
    s ??= "";
   state = (boatClass: state.boatClass, sailNumber: s);
  }

  clear() {
    state = (boatClass: unsetClass, sailNumber: "");
  }
}

final compFilterProvider =
    NotifierProvider<CompFilterNotifier, CompFilter>(CompFilterNotifier.new);

final filteredCompetitorListProvider = Provider((ref) {
  final competitors = ref.watch(racingCompetitorsProvider(true));
  final filter = ref.watch(compFilterProvider);
  return competitors
      .where((comp) =>
          (filter.boatClass == CompFilterNotifier.unsetClass || comp.boatClass == filter.boatClass) &&
          comp.sailNumber.toString().contains(filter.sailNumber))
      .toList();
});
