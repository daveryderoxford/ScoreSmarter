import 'package:flutter/foundation.dart';
import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:sailbrowser_flutter/features/results/scoring/series_scoring_data.dart';
import 'package:uuid/uuid.dart';

part 'series.freezed.dart';
part 'series.g.dart';

@freezed
class Series with _$Series {
  factory Series.def({
    required String season,
    required String id,
    required String name,
    required String fleetId,
    DateTime? startDate,
    DateTime? endDate,
    required List<Race> races,
    required bool archived,
    required SeriesScoringData scoringScheme,
    @Default("") note,
  }) = _Series;

  /// Public Series constructor.
  /// the series Id will be populated
  factory Series({
    String? season,
    required String name,
    required String fleetId,
    DateTime? startDate,
    DateTime? endDate,
    SeriesScoringData? scoringScheme,
    String? note,
  }) {
    return _Series(
      id: const Uuid().v1(),
      season: season ?? "",
      name: name,
      fleetId: fleetId,
      startDate: startDate,
      endDate: endDate,
      races: [],
      archived: false,
      scoringScheme: scoringScheme ?? SeriesScoringData.defaultScheme,
      note: note ?? "",
    );
  }

  const Series._();

  factory Series.fromJson(Map<String, Object?> json) => _$SeriesFromJson(json);
}

/// Type of race conventional/pursuit
enum RaceType {
  conventional('Conventional'),
  pursuit('Pursuit');

  final String displayName;
  const RaceType(this.displayName);
}

/// Status of the race - future/in progess etc.
enum RaceStatus {
  future('Future'),
  inProgress('In progress'),
  cancelled('Canceled'),
  postponed('Postponed'),
  completed('Completed'),
  published('Published');

  final String displayName;
  const RaceStatus(this.displayName);
}

@freezed
class Race with _$Race {
  factory Race.def({
    required String id,
    @Default('Unset') String seriesName,
    @Default(0) int index,
    required String fleetId,
    required String seriesId,
    required DateTime scheduledStart,
    required int raceOfDay,
    required DateTime actualStart,
    required RaceType type,
    required RaceStatus status,
    required bool isDiscardable,
    required bool isAverageLap,
  }) = _Race;

  // Factory race consructor specifying defaults
  factory Race({
    required String fleetId,
    required String seriesId,
    required DateTime scheduledStart,
    required int raceOfDay,
    DateTime? actualStart,
    RaceType? type,
    RaceStatus? status,
    bool? isDiscardable,
    bool? isAverageLap,
  }) {
    return _Race(
      id: const Uuid().v4(),
      fleetId: fleetId,
      seriesId: seriesId,
      scheduledStart: scheduledStart,
      raceOfDay: raceOfDay,
      actualStart: actualStart ?? DateTime.fromMicrosecondsSinceEpoch(0),
      type: type ?? RaceType.conventional,
      status: RaceStatus.future,
      isDiscardable: isDiscardable ?? true,
      isAverageLap: isAverageLap ?? true,
    );
  }

  String get name => '$seriesName - Race $index';
  String get shortname => 'Race $index';

  /// Date the race is run.  Obtained from the actual start time if specified or the scheduled start if not.
  DateTime get date => (actualStart != DateTime.fromMicrosecondsSinceEpoch(0))
      ? DateTime(actualStart.year, actualStart.month, actualStart.day)
      : DateTime(scheduledStart.year, scheduledStart.month, scheduledStart.day);

  const Race._();

  factory Race.fromJson(Map<String, Object?> json) => _$RaceFromJson(json);
}
