import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_form_builder/flutter_form_builder.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:form_builder_validators/form_builder_validators.dart';
import 'package:go_router/go_router.dart';
import 'package:loggy/loggy.dart';
import 'package:sailbrowser_flutter/common_widgets/responsive_center.dart';
import 'package:sailbrowser_flutter/common_widgets/will_pop_form.dart';
import 'package:sailbrowser_flutter/features/club/domain/clubs_service.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series_service.dart';
import 'package:sailbrowser_flutter/features/results/scoring/series_scoring_data.dart';

class EditSeries extends ConsumerStatefulWidget {
  final String id;
  final Series? series;

  const EditSeries({this.series, required this.id, super.key});

  @override
  ConsumerState<EditSeries> createState() => _EditSeriesState();
}

class _EditSeriesState extends ConsumerState<EditSeries> with UiLoggy {
  final _formKey = GlobalKey<FormBuilderState>();

  Series? series;

  @override
  void initState() {
    super.initState();
    series = widget.series;
  }

  _submit()  {
    final form = _formKey.currentState!;
    form.saveAndValidate();

    if (form.isValid) {
      final formData = _formKey.currentState!.value;

      final scoringScheme = SeriesScoringData(
          scheme: formData['scoringScheme'],
          initialDiscardAfter: formData['initialDiscardAfter'],
          subsequentDiscardsEveryN: formData['subsequentDiscardsEveryN'],
          entryAlgorithm: formData['entryAlgorithm']);

      if (series == null) {
        final update = Series(
          name: formData['name'],
          fleetId: formData['fleetId'],
          scoringScheme: scoringScheme,
        );
        ref.read(seriesRepositoryProvider).add(update);
      } else {
        final update = series!.copyWith(
          name: formData['name'],
          fleetId: formData['fleetId'],
          scoringScheme: scoringScheme,
        );

        ref.read(seriesRepositoryProvider).update(update, update.id);
      }

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
            title: Text(
                widget.series == null ? 'New Series' : 'Edit Series Details'),
            actions: <Widget>[
              TextButton(
                //      onPressed: state.isLoading ? null : _submit,
                onPressed: _submit,
                child: const Text(
                  'Save',
                ),
              ),
            ],
          ),
          body: _buildContents(),
        ));
  }

  Widget _buildContents() {
    return SingleChildScrollView(
      child: ResponsiveCenter(
        maxContentWidth: 600,
        padding: const EdgeInsets.all(16.0),
        child: Card(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: _buildForm(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildForm() {
    return FormBuilder(
      key: _formKey,
      onChanged: () {
        _formKey.currentState!.save();
        debugPrint(_formKey.currentState!.value.toString());
      },
      initialValue: series != null ? series!.toJson() : {},
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: _buildFormChildren(),
      ),
    );
  }

  List<Widget> _buildFormChildren() {
    final currentClub = ref.read(currentClubProvider);
    final initialSeriesScoring = (series == null)
        ? currentClub.current.defaultScoringData
        : series!.scoringScheme;

    final fleets = ref.read(currentClubProvider).current.fleets;
    return [
      FormBuilderTextField(
        name: 'name',
        autovalidateMode: AutovalidateMode.onUserInteraction,
        decoration: const InputDecoration(
          labelText: 'Name',
          helperText: "eg Summer",
        ),
        validator: FormBuilderValidators.required(),
      ),
      FormBuilderDropdown<String>(
        name: 'fleetId',
        decoration: const InputDecoration(
          labelText: 'Fleet',
        ),
        validator: FormBuilderValidators.required(),
        autovalidateMode: AutovalidateMode.onUserInteraction,
        items: fleets
            .map((fleet) => DropdownMenuItem(
                  value: fleet.id,
                  child: Text(fleet.name),
                ))
            .toList(),
      ),
      FormBuilderDropdown<SeriesScoringScheme>(
        name: 'scoringScheme',
        decoration: const InputDecoration(
          labelText: 'Series scoring',
        ),
        validator: FormBuilderValidators.required(),
        autovalidateMode: AutovalidateMode.onUserInteraction,
        initialValue: initialSeriesScoring.scheme,
        items: SeriesScoringScheme.values
            .map((scheme) => DropdownMenuItem(
                  value: scheme,
                  child: Text(scheme.displayName),
                ))
            .toList(),
      ),
      FormBuilderDropdown<SeriesEntryAlgorithm>(
        name: 'entryAlgorithm',
        decoration: const InputDecoration(
          labelText: 'Entries as',
        ),
        validator: FormBuilderValidators.required(),
        autovalidateMode: AutovalidateMode.onUserInteraction,
        initialValue: (series != null)
            ? series!.scoringScheme.entryAlgorithm
            : initialSeriesScoring.entryAlgorithm,
        items: SeriesEntryAlgorithm.values
            .map((scheme) => DropdownMenuItem(
                  value: scheme,
                  child: Text(scheme.displayName),
                ))
            .toList(),
      ),
      FormBuilderTextField(
        name: 'initialDiscardAfter',
        initialValue: initialSeriesScoring.initialDiscardAfter.toString(),
        autovalidateMode: AutovalidateMode.onUserInteraction,
        decoration: const InputDecoration(
          labelText: 'Inital discard',
          helperText: "Initial discard after N races",
        ),
        validator: FormBuilderValidators.compose([
          FormBuilderValidators.required(),
          FormBuilderValidators.min(2),
        ]),
        keyboardType: TextInputType.number,
        inputFormatters: <TextInputFormatter>[
          FilteringTextInputFormatter.digitsOnly
        ],
        valueTransformer: (text) => text != null ? num.tryParse(text) : null,
      ),
      FormBuilderTextField(
        name: 'subsequentDiscardsEveryN',
        initialValue: initialSeriesScoring.subsequentDiscardsEveryN.toString(),
        autovalidateMode: AutovalidateMode.onUserInteraction,
        decoration: const InputDecoration(
          labelText: 'Subsequent discards',
          helperText: "Subsequent discards after every N races",
        ),
        validator: FormBuilderValidators.compose([
          FormBuilderValidators.required(),
          FormBuilderValidators.min(2),
        ]),
        keyboardType: TextInputType.number,
        inputFormatters: <TextInputFormatter>[
          FilteringTextInputFormatter.digitsOnly
        ],
        valueTransformer: (text) => text != null ? num.tryParse(text) : null,
      ),
    ];
  }
}
