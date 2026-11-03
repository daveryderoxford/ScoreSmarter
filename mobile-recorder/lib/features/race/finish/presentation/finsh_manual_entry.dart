import 'package:flutter/material.dart';
import 'package:flutter_form_builder/flutter_form_builder.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:form_builder_validators/form_builder_validators.dart';
import 'package:go_router/go_router.dart';
import 'package:loggy/loggy.dart';
import 'package:sailbrowser_flutter/common_widgets/form_builder_double_field.dart';
import 'package:sailbrowser_flutter/common_widgets/form_builder_integer_field.dart';
import 'package:sailbrowser_flutter/common_widgets/responsive_center.dart';
import 'package:sailbrowser_flutter/common_widgets/time_input_textfield.dart';
import 'package:sailbrowser_flutter/common_widgets/will_pop_form.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series_service.dart';
import 'package:sailbrowser_flutter/features/race/domain/race_competitor.dart';
import 'package:sailbrowser_flutter/features/race/domain/race_competitor_service.dart';
import 'package:sailbrowser_flutter/features/race/domain/result_code.dart';

import 'widgits/finished_list_item.dart';

/// Dialog to manually enter
/// Finish time, results code number of laps for a competitor.
class FinishManualEntry extends ConsumerStatefulWidget {
  const FinishManualEntry({required this.competitor, super.key});

  final RaceCompetitor competitor;

  @override
  ConsumerState<FinishManualEntry> createState() => _FinishManualEntryState();
}

class _FinishManualEntryState extends ConsumerState<FinishManualEntry>
    with UiLoggy {
  final _formKey = GlobalKey<FormBuilderState>();

  late final RaceCompetitor competitor;

  @override
  void initState() {
    super.initState();
    competitor = widget.competitor;
  }

  /// Validate that finish time is avalaible if status is set to ok.

  _submit() {
    final form = _formKey.currentState!;
    form.saveAndValidate();

    if (form.isValid) {
      final competitorService = ref.read(raceCompetitorRepositoryProvider);

      final formData = _formKey.currentState!.value;

      var code = formData['resultCode'];
      final manTime = formData['finishTime'];
      final manLaps = formData['manualLaps'];

      final d = competitor.startTime!;

      // Add day of race to manual time
      final manualFinish = (manTime != null)
          ? DateTime(d.year, d.month, d.day, manTime.hour, manTime.minute,
              manTime.second)
          : null;

      // If manual finish time is speciifed chnage status of unfinished to OK
      if (code == ResultCode.notFinished && manualFinish != null) {
        code = ResultCode.ok;
      }

      // Set start time - TODO ideally.
      // 1. the time widget would always retuen and value
      // 2. the time editor widget would also retrun the date
      var startTime = competitor.startTime!;
      if (formData['startTime'] != null) {
        startTime = DateTime(d.year, d.month, d.day, formData['startTime'].hour,
            formData['startTime'].minute, formData['startTime'].second);
      }

      final update = competitor.copyWith(
        manualFinishTime: manualFinish,
        manualLaps: manLaps,
        resultCode: code,
        startTime: startTime,
        handicap: formData['handicap'],
      );
      final race = ref.watch(raceProvider(competitor.raceId));
      competitorService.update(update, update.id, race!.seriesId);

      if (context.mounted) {
        context.pop();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return WillPopForm(
      formKey: _formKey,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Manual Entry'),
          actions: <Widget>[
            FilledButton(
              onPressed: _submit,
              child: const Text(
                'Save',
              ),
            ),
          ],
        ),
        body: _buildContents(),
      ),
    );
  }

  Widget _buildContents() {
    return SingleChildScrollView(
      child: ResponsiveCenter(
        maxContentWidth: 600,
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Center(child: FinishedListItem(competitor, showButtons: false)),
            /*   Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
        Text(competitor.boatClass, textScaleFactor: 1.2),
        const SizedBox(width: 25),
        SailNumber(num: competitor.sailNumber), 
      ]), */
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: _buildForm(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildForm() {
    return FormBuilder(
      key: _formKey,
      onChanged: () {
        _formKey.currentState!.save();
        loggy.info(_formKey.currentState!.value.toString());
      },
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        FormBuilderField<DateTime?>(
          name: "finishTime",
          builder: (FormFieldState<DateTime?> field) {
            return InputDecorator(
              decoration: InputDecoration(
                labelText: "Finish time",
                contentPadding: const EdgeInsets.only(top: 10.0, bottom: 0.0),
                border: InputBorder.none,
                errorText: field.errorText,
              ),
              child: TimeInputField(
                initialValue: competitor.finishTime,
                onChanged: (value) => field.didChange(value),
              ),
            );
          },
        ),
        FormBuilderIntegerField(
          name: 'manualLaps',
          initialValue: 0,
          decoration: InputDecoration(
              label: const Text('Laps'),
              helperText:
                  '0 to use recorded number of laps (${competitor.lapTimes.length + 1})'),
        ),
        SizedBox(
          height: 100,
          child: FormBuilderDropdown<ResultCode>(
            name: 'resultCode',
            isExpanded: true,
            autovalidateMode: AutovalidateMode.onUserInteraction,
            initialValue: competitor.resultCode,
            // HACK to increase the size of the displayed option to be the same as the item - maybe try menubuilder instead.
            style: const TextStyle(fontSize: 60.0),
            decoration: const InputDecoration(
              labelText: 'Result code',
            ),
            validator: FormBuilderValidators.required(),
            items: ResultCode.values
                .map((code) => DropdownMenuItem(
                      alignment: AlignmentDirectional.centerStart,
                      value: code,
                      child: ListTile(
                        title: Text(code.displayName),
                        subtitle: Text(code.description),
                      ),
                    ))
                .toList(),
          ),
        ),
        FormBuilderDoubleField(
          name: 'handicap',
          initialValue: competitor.handicap,
          decoration: const InputDecoration(
            label: Text('Handicap'),
          ),
        ),
        FormBuilderField<DateTime?>(
          name: "startTime",
          builder: (FormFieldState<DateTime?> field) {
            return InputDecorator(
              decoration: InputDecoration(
                labelText: "Start time",
                contentPadding: const EdgeInsets.only(top: 10.0, bottom: 0.0),
                border: InputBorder.none,
                errorText: field.errorText,
              ),
              child: TimeInputField(
                initialValue: competitor.startTime,
                onChanged: (value) => field.didChange(value),
              ),
            );
          },
        ),
      ]),
    );
  }
}
