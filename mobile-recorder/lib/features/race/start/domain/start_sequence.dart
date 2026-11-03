import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series.dart';

part 'start_sequence.freezed.dart';

enum StartStatus {
  notConfigured, // Races not configured
  waiting,       // races configured and waiting for sequence to start
  running,       // Start sequence running.  Not all races have been started.
  stopped,       // Start sequence has been stopped.  Races thta have not alreday started can be re-started. 
  finished,      // All races in the sequence have been started.  Still configured with started races.
}

@freezed
class StartSequenceState with _$StartSequenceState {
  const factory StartSequenceState({
    @Default(StartStatus.notConfigured) startStatus,
    @Default([]) List<Race> races,
    @Default([]) List<Race> startedRaces,
    @Default(Duration(minutes: 2)) Duration intervalBetweenStarts,
    required DateTime nextStartTime,
    @Default(Duration()) Duration timeToNextStart,
    @Default(Duration()) Duration firstStartTime,
  }) = _StartSequenceState;

  const StartSequenceState._();
}
