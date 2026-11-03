// ignore_for_file: must_be_immutable
// isLoading/errorString just used within build method. State not retained over build invocations.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:loggy/loggy.dart';
import 'package:sailbrowser_flutter/common_widgets/centered_circular_progress_indicator.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series_service.dart';
import 'package:sailbrowser_flutter/features/race/domain/race_competitor_service.dart';

/// Eager in itialistyion of async providers
/// that are always expected to return a valid value
class EagerInitialization extends ConsumerWidget with UiLoggy {
  EagerInitialization({super.key, required this.child});
  final Widget child;

  var isLoading = false;
  var errorString = "";

// Handle error states and loading states
  _handleState(AsyncValue result, String name) {
    if (result.isLoading) {
      isLoading = true;
    } else if (result.hasError) {
      errorString = '$errorString\nError encountered initialising $name';
      logError(
          'Error encountered initialising $name \nError:  ${result.error.toString()}');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    isLoading = false;
    errorString = "";
    
    // Eagerly initialize providers by watching them.
    // By using "watch", the provider will stay alive and not be disposed.
    _handleState(ref.watch(allSeriesProvider), "allSeriesProvider");
    _handleState(ref.watch(allRacesProvider), "allRacesProvider");
    _handleState(ref.watch(allRaceDataProvider), "allRaceDataProvider");
    ref.watch(currentCompetitors); // TODO - not sure why this gets caught in loading state if I handle state

    // _handleState(ref.watch(resultsService), "resultsService");

    if (isLoading) {
      return const CenteredCircularProgressIndicator();
    }
    if (errorString != '') {
      return (Text(errorString));
    } else {
      return child;
    }
  }
}

