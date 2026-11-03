import 'package:flutter/material.dart';
import 'package:flutter_form_builder/flutter_form_builder.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:form_builder_validators/form_builder_validators.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series.dart';
import 'package:sailbrowser_flutter/features/race/domain/race_competitor.dart';
import 'package:sailbrowser_flutter/features/race/domain/selected_races.dart';

class SelectRacesFilterChip extends ConsumerWidget {
  const SelectRacesFilterChip({
    super.key,
    required this.competitor,
  });

  final RaceCompetitor? competitor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {

    final raceData = ref.watch(selectedRacesProvider).toList();
    return FormBuilderFilterChip<Race>(
      name: 'races',
      validator: FormBuilderValidators.required(
          errorText: 'At least one race must be selected'),
      autovalidateMode: AutovalidateMode.onUserInteraction,
      direction: Axis.vertical,
      options: raceData.map(
        (data) {
          return FormBuilderChipOption(
            value: data.race,
            child: Text('${data.race.name} '),
          );
        },
      ).toList(),
    );
  }
}
