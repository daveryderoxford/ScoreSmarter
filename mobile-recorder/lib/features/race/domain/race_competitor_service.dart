import 'package:clock/clock.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:loggy/loggy.dart';
import 'package:rxdart/rxdart.dart';
import 'package:sailbrowser_flutter/common_widgets/snackbar_service.dart';
import 'package:sailbrowser_flutter/features/club/domain/clubs_service.dart';
import 'package:sailbrowser_flutter/features/race/domain/result_code.dart';
import 'package:sailbrowser_flutter/features/race/domain/selected_races.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series.dart';
import 'package:sailbrowser_flutter/features/race/domain/race_competitor.dart';

typedef RaceCompetitorChangers = ({
  DocumentChangeType type,
  RaceCompetitor competitor
});

/// Competitors for selected races
class RaceCompetitorService with UiLoggy {
  RaceCompetitorService(this.clubId, this.selectedRaces) {
    // compute unique series Ids for selected races
    seriesIds = selectedRaces.map((race) => race.seriesId).toSet().toList();
  }

  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final String clubId;
  final List<Race> selectedRaces;
  late final List<String> seriesIds;

  late final ReplayStream<List<RaceCompetitor>> _currectCompetitors$ =
      _firestore
          .collectionGroup("race_competitors")
          .where('raceId', whereIn: selectedRaces.map((race) => race.id))
          .snapshots()
          .map(
    (snap) {
      final comps =
          snap.docs.map((doc) => RaceCompetitor.fromJson(doc.data())).toList();
      final changes = snap.docChanges.map<RaceCompetitorChangers>((change) {
        final comp = RaceCompetitor.fromJson(change.doc.data()!);
        return (type: change.type, competitor: comp);
      }).toList();
      _changes$.add(changes);
      return comps;
    },
  ).startWith(<RaceCompetitor>[]).shareReplay();

  /// Stream of competitors for the currectly selected races
  get currectCompetitors$ => (selectedRaces.isEmpty)
      ? Stream<List<RaceCompetitor>>.value(<RaceCompetitor>[])
      : _currectCompetitors$;

  final _changes$ = BehaviorSubject<List<RaceCompetitorChangers>>.seeded([]);

  /// Stream of changes to currect competitors.
  get changes$ => _changes$.stream;

  add(RaceCompetitor comp, String seriesId) {
    _compCollection(seriesId).doc(comp.id).set(comp).onError(
        (error, stackTrace) => _errorHandler(error, stackTrace, 'add'));
  }

  remove(String id, String seriesId) {
    _compCollection(seriesId).doc(id).delete().onError(
        (error, stackTrace) => _errorHandler(error, stackTrace, 'remove'));
  }

  update(RaceCompetitor comp, String id, String seriesId) async {
    _compCollection(seriesId).doc(id).update(comp.toJson()).onError(
        (error, stackTrace) => _errorHandler(error, stackTrace, 'update'));
  }

  saveLap(RaceCompetitor comp, String id, String seriesId) {
    final time = clock.now();
    final laps = [...comp.lapTimes, time];

    update(comp.copyWith(lapTimes: laps), id, seriesId);
  }

  finish(RaceCompetitor comp, String id, String seriesId) {
    final time = clock.now();
    final resultCode = comp.resultCode == ResultCode.notFinished
        ? ResultCode.ok
        : comp.resultCode;

    final race = selectedRaces.firstWhere((race) => race.id == comp.raceId);

    final c = comp.copyWith(
        recordedFinishTime: time,
        startTime: race.actualStart,
        resultCode: resultCode);

    update(c, id, seriesId);
  }

  CollectionReference _compCollection(String seriesId) {
    return _firestore
        .collection('/clubs/$clubId/series/$seriesId/race_competitors')
        .withConverter<RaceCompetitor>(
          fromFirestore: (snapshot, _) =>
              RaceCompetitor.fromJson(snapshot.data()!),
          toFirestore: (RaceCompetitor competitor, _) => competitor.toJson(),
        );
  }

  _errorHandler(Object? error, StackTrace stackTrace, String func) {
    var s = 'Error encountered in Race competitor. $func';
    s = (error == null) ? s : '$s\n${error.toString()}';
    SnackBarService.showErrorSnackBar(content: s);
    logError(s);
  }
}

final raceCompetitorRepositoryProvider = Provider((ref) {
  final races =
      ref.watch(selectedRacesProvider).map((data) => data.race).toList();
  final clubId = ref.watch(currentClubProvider).current.id;
  return RaceCompetitorService(clubId, races);
});

/// Competitors for the currently selected races
final currentCompetitors = StreamProvider<List<RaceCompetitor>>(
  (ref) {
    final db = ref.watch(raceCompetitorRepositoryProvider);
    return db.currectCompetitors$;
  },
);

/// Stream of changes to competitor data.
/// If a competitor is changed or added
final changedCompetitors = StreamProvider<List<RaceCompetitorChangers>>(
  (ref) {
    final db = ref.watch(raceCompetitorRepositoryProvider);
    return db.changes$;
  },
);
