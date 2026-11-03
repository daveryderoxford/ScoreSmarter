import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:loggy/loggy.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series_service.dart';
import 'package:sailbrowser_flutter/features/race/domain/race_competitor_service.dart';
import 'package:sailbrowser_flutter/features/race/domain/result_code.dart';
import 'package:sailbrowser_flutter/features/race/domain/selected_races.dart';
import 'package:sailbrowser_flutter/features/results/domain/race_result.dart';
import 'package:sailbrowser_flutter/features/results/domain/results_repository.dart';
import 'package:sailbrowser_flutter/features/results/domain/series_results.dart';
import 'package:sailbrowser_flutter/features/results/scoring/race_scorer.dart';
import 'package:sailbrowser_flutter/features/results/scoring/series_scorer.dart';
import 'package:sailbrowser_flutter/util/list_extensions.dart';

/// Results for currently selected races.
class ResultsService extends AsyncNotifier<List<SeriesResults>> with UiLoggy {
  ResultsService(this.seriesScorer, this.raceScorer);

  final RaceScorer raceScorer;
  final SeriesScorer seriesScorer;

  /// Get series results when not in erro/loading state

  SeriesResults? _getSeriesResult(String id) {
    final results = state.hasValue ? state.value : <SeriesResults>[];
    return results?.firstWhereOrNull((s) => (s.seriesId == id));
  }

  @override
  build() async {
    // OK? - does not trigger rebuild as state never changes
    // it just triggers a aide efffect of marking competitors dirty. 
    ref.watch(competitorsDirty);

    final results = state.hasValue ? state.value : <SeriesResults>[];

    /// Recompute the state whenever the selected race changes.
    final selected = ref.watch(selectedRacesProvider);

    for (var raceData in selected) {
      // Read series - Series results are managed on the server
      // They maust exist and be successfully read  
      var seriesResult =
          results!.firstWhereOrNull((s) => raceData.series.id == s.seriesId);
      if (seriesResult == null) {
        seriesResult =
              await ref.read(resultsRepositoryProvider).read(raceData.series.id);
        if (seriesResult == null) {
          logWarning('Series result read from database - Do not allow results to be published until we can read'); 
          continue;
        } else {
          results.add(seriesResult);
        }
      }

      /// If race result for selected race does not exist for the series then create it
      var raceResult = seriesResult.races
          .firstWhereOrNull((r) => r.raceId == raceData.race.id);
      if (raceResult == null) {
        raceResult = RaceResults.fromRace(raceData.race);
        seriesResult.races.add(raceResult);
      }
      raceResult.dirty = true;  // TODO change to selected and dont include in serialised output
    }
    return (results!);
  }

  /// Merk series as dirty.
  /// All races in the series are also marked as dirty.
  markSeriesAsDirty(String seriesId) {
    if (state.hasValue) {
      final seriesResult = _getSeriesResult(seriesId);
      seriesResult!.dirty = true;
    } else {
      logWarning('Setting series dirty flage ignored as no state value');
    }
  }

  /// Get data required to calculate race results and calculated the results.
  _calcRaceResultInternal(RaceResults raceResults) {
    final competitors = ref.read(currentCompetitors).requireValue;
    final raceCompetitors = competitors
        .where((comp) =>
            comp.raceId == raceResults.raceId &&
            comp.resultCode != ResultCode.notFinished)
        .toList();

    final raceData = ref
        .read(allRaceDataProvider)
        .requireValue
        .firstWhereOrNull((data) => data.race.id == raceResults.raceId);

    final compResults = raceScorer.calculateRaceResults(
        raceCompetitors, raceData!.fleet.handicapScheme, raceData.race);

    raceResults.results = compResults;
   // raceResults.dirty = false;  // TODO being used as selected currently - so removed 

    return raceResults;

  }

  computeSeriesResults(SeriesResults seriesResults) {
    
    // Compute race results for all dirty races
    final races = seriesResults.races
        .map<RaceResults>(
            (race) => race.dirty ? _calcRaceResultInternal(race) : race)
        .toList();
    seriesResults.races = races;

    // Compute series results
    final series = ref.read(seriesProvider(seriesResults.seriesId));

    seriesScorer.calculateSeriesResults(
        seriesResults, seriesResults.races, series!.scoringScheme);
    seriesResults.dirty = false;

    // Save updated state for the series
    state = AsyncValue.data(state.value!
        .map<SeriesResults>(
            (s) => (s.seriesId == seriesResults.seriesId) ? seriesResults : s)
        .toList());
  }
}

final resultsService =
    AsyncNotifierProvider<ResultsService, List<SeriesResults>>(
        () => ResultsService(SeriesScorer(), RaceScorer()));

final raceResultsProvider = Provider<List<RaceResults>>((ref) {
  List<RaceResults> allRaces = [];

  final seriesResults = ref.watch(resultsService).valueOrNull;
  if (seriesResults == null) return [];

  for (var series in seriesResults) {
    allRaces.addAll(series.races);
  }
  // allRaces.sort((a, b) => SeriesService.sortRaceData(a, b));

  return allRaces;
});

/// If a competitor is modified or removed then mark
/// series and race as dirty so results are re-computed.
final competitorsDirty = Provider((ref) {
  final changed = ref.watch(changedCompetitors);
  changed.when(
      skipLoadingOnReload: true,
      data: (changes) {
        final res = ref.read(resultsService.notifier);
        for (var change in changes) {
          // Only mark if changed or removed.
          // Newly added  should have dirty set
          if (change.type != DocumentChangeType.added) {
            final comp = change.competitor;
            res.markSeriesAsDirty(comp.seriesId);
          }
        }
      },
      error: (Object error, StackTrace stackTrace) =>
          logError('Error ${error.toString()}'),
      loading: () => {});
});
