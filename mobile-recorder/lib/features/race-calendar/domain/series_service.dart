import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:loggy/loggy.dart';
import 'package:rxdart/rxdart.dart';
import 'package:sailbrowser_flutter/common_widgets/snackbar_service.dart';
import 'package:sailbrowser_flutter/features/club/domain/clubs_service.dart';
import 'package:sailbrowser_flutter/features/club/domain/fleet.dart';

import 'series.dart';

class SeriesService with UiLoggy {
  static final defaultDate = DateTime.fromMicrosecondsSinceEpoch(0);

  /// Order race data by:
  /// 1. Scheduled start date
  /// 2. Races of the day
  /// TODO needs to order by fleet.startorder
  static int sortRaces(Race a, b) {
    int ret = a.scheduledStart.compareTo(b.scheduledStart);

    if (ret == 0) {
      return a.raceOfDay - b.raceOfDay as int;
    } else {
      return ret;
    }
  }

  static int sortRaceData(AllRaceData a, b) {
    int ret = a.race.scheduledStart.compareTo(b.race.scheduledStart);

    if (ret == 0) {
      return a.race.raceOfDay - b.race.raceOfDay as int;
    } else {
      return ret;
    }
  }

  /// Series sorter - series are sorted in order of:
  ///  * Series with no races first - null start date
  ///  * TODO start of first race. No races sorted at the end
  ///  * fleetId
  static int seriesSort(Series a, b) {
    if (a.startDate == null) {
      return b.startDate == null ? 1 : 0;
    }

    if (b.startDate == null) {
      return -1;
    }

    int ret = a.startDate!.compareTo(b.startDate!);
    if (ret != 0) {
      return ret;
    } else {
      return (a.fleetId.compareTo(b.fleetId));
    }
  }

  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final String clubId;

  late final CollectionReference _series =
      _firestore.collection('/clubs/$clubId/series/').withConverter<Series>(
            fromFirestore: (snapshot, _) => Series.fromJson(snapshot.data()!),
            toFirestore: (Series series, _) => series.toJson(),
          );

  late final ReplayStream<List<Series>> allRaceSeriess$ =
      _series.snapshots().map(
    (snap) {
      final series =
          snap.docs.map<Series>((doc) => doc.data() as Series).toList();
      series.sort((a, b) => seriesSort(a, b));
      return series;
    },
  ).shareReplay();

  late final ReplayStream<List<Race>> allRaces$ = allRaceSeriess$.map(
    (seriesList) {
      final List<Race> races = [];
      for (var series in seriesList) {
        races.addAll(series.races);
      }
      races.sort((Race a, b) => sortRaces(a, b));
      return races;
    },
  ).shareReplay();

  SeriesService(this.clubId);

  add(Series series) {
    // set series Id.
    final updated1 = series.copyWith(id: _series.doc().id);

    final update = _setRaceDetails(updated1, [...updated1.races]);

    _series.doc(update.id).set(update).onError(
        (error, stackTrace) => _errorHandler(error, stackTrace, 'add'));
  }

  /// Remove a series
  /// All competitors should have been removed from the series before removing removing it.
  remove(String id) {
    _series.doc(id).delete().onError(
        (error, stackTrace) => _errorHandler(error, stackTrace, 'remove'));
  }

// Edit a series
  update(Series series, String id) {
    final upDatedSeries = _setRaceDetails(series, [...series.races]);

    _series.doc(id).update(upDatedSeries.toJson()).onError(
        (error, stackTrace) => _errorHandler(error, stackTrace, 'update'));
  }

  /// Adds a new race to a series.
  addRace(Series series, Race race) {
    if (race.seriesId != series.id) {
      throw (Exception("Race seaiesId does not equal series id"));
    }

    final races = [...series.races, race];

    final update = series.copyWith(races: races);

    this.update(update, update.id);
  }

  /// Update a races for a series
  updateRace(Series series, String updatedId, Race race) {
    if (race.seriesId != series.id) {
      throw (Exception("Race seaiesId does not equal series id"));
    }

    final races = series.races
        .map((original) => (updatedId == original.id) ? race : original)
        .toList();

    final update = series.copyWith(races: races);

    this.update(update, update.id);
  }

  /// Remove a race for a series.
  /// All competitors should have been removed from the series before removing a race.
  removeRace(Series series, String deletedId) {
    final races = series.races.where((race) => race.id != deletedId).toList();

    final update = series.copyWith(races: races);

    this.update(update, update.id);
  }

  /// Set de-normalised race details in race and series objects
  Series _setRaceDetails(Series series, List<Race> races) {
    // Sort Races for series into order based on start/end time and startgroup
    races.sort((Race a, b) => sortRaces(a, b));

    // Set de-normalised details from the series
    final updatedRaces = races.map((race) {
      int index = races.indexOf(race);
      return race.copyWith(
          seriesId: series.id,
          fleetId: series.fleetId,
          index: index,
          seriesName: series.name);
    }).toList();

    // Set start/end time of series
    final startDate = races.isNotEmpty ? races[0].scheduledStart : defaultDate;
    final endDate =
        races.isNotEmpty ? races[races.length - 1].scheduledStart : defaultDate;

    return series.copyWith(
        races: updatedRaces, startDate: startDate, endDate: endDate);
  }

  _errorHandler(Object? error, StackTrace stackTrace, String func) {
    var s = 'Error encountered in Series. $func';
    s = (error == null) ? s : '$s\n${error.toString()}';
    SnackBarService.showErrorSnackBar(content: s);
    logError(s);
  }
}

final seriesRepositoryProvider =
    Provider((ref) => SeriesService(ref.watch(currentClubProvider).current.id));

/// All series for all time
final allSeriesProvider = StreamProvider<List<Series>>((ref) {
  final db = ref.watch(seriesRepositoryProvider);
  return db.allRaceSeriess$;
});

/// Find series based on its Id
final seriesProvider = Provider.autoDispose.family<Series?, String>((ref, id) {
  final series = ref.watch(allSeriesProvider);
  return series.requireValue.firstWhere((s) => s.id == id);
});

/// Find a races based on its Id
final raceProvider = Provider.autoDispose.family<Race?, String>((ref, id) {
  final races = ref.watch(allRacesProvider);
  if (races.hasError) {
    debugPrint('raceProvider races has error');
  } else if (races.isLoading) {
    debugPrint('raceProvider loading');
  } else {
    debugPrint('raceProvider races count: ${races.value!.length}');
  }
  return races.valueOrNull?.firstWhere((s) => s.id == id);
});

/// Streeam of all races
final allRacesProvider = StreamProvider<List<Race>>((ref) {
  final db = ref.watch(seriesRepositoryProvider);
  return db.allRaces$;
});

typedef AllRaceData = ({Race race, Series series, Fleet fleet});

final allRaceDataProvider = StreamProvider<List<AllRaceData>>((ref) {
  final seriesProvider = ref.watch(seriesRepositoryProvider);
  final club = ref.watch(currentClubProvider);

  return seriesProvider.allRaceSeriess$.map((seriesList) {
    List<AllRaceData> allRaces = [];

    for (var series in seriesList) {
      final seriesRaces = series.races.map<AllRaceData>((race) {
        final fleet =
            club.current.fleets.firstWhere((fleet) => race.fleetId == fleet.id);
        return (race: race, series: series, fleet: fleet);
      }).toList();

      allRaces.addAll(seriesRaces);
    }
    allRaces.sort((a, b) => SeriesService.sortRaceData(a, b));

    return allRaces;
    //   allRaces.sort((AllRaceData a, b) => sortRaces(a.race, b.race));
  }).shareReplay();
});
