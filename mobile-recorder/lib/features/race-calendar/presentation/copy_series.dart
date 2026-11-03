import 'package:flutter/material.dart';
import 'package:flutter_form_builder/flutter_form_builder.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:form_builder_validators/form_builder_validators.dart';
import 'package:loggy/loggy.dart';
import 'package:sailbrowser_flutter/common_widgets/responsive_center.dart';
import 'package:sailbrowser_flutter/common_widgets/will_pop_form.dart';
import 'package:sailbrowser_flutter/features/club/domain/clubs_service.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series_service.dart';
import 'package:uuid/uuid.dart';

class CopySeries extends ConsumerStatefulWidget {
  final Series? series;

  const CopySeries({this.series, super.key});

  @override
  ConsumerState<CopySeries> createState() => _CopySeriesState();
}

class _CopySeriesState extends ConsumerState<CopySeries> with UiLoggy {
  final _formKey = GlobalKey<FormBuilderState>();

  Series? series;

  @override
  void initState() {
    super.initState();
    series = widget.series;
  }

  _submit() {
    _formKey.currentState?.saveAndValidate();
    final form = _formKey.currentState!;
    form.validate();

    final raceSeriesService = ref.read(seriesRepositoryProvider);

    if (form.isValid) {
      final formData = _formKey.currentState!.value;
      final updatedFleetId = formData['fleetId'];

      final updatedRaces = series!.races.map(
        (race) {
          return race.copyWith(
            id: const Uuid().v4(),
            fleetId: updatedFleetId,
          );
        },
      ).toList();

      final updatedSeries = series!.copyWith(
        name: formData['name'],
        fleetId: updatedFleetId,
        races: updatedRaces,
      );

      raceSeriesService.add(updatedSeries);

      // TODO: Could not use context.goNamed('series') as it did not navigate back
      // up the stack - admin worked.  Need to look at how Navigator and goRouter interact.
      // Currently just using gorouter to manage the top-level navigation stacks
      if (context.mounted) {
        Navigator.of(context).pop();
        Navigator.of(context).pop();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return WillPopForm(
      formKey: _formKey,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Copy series'),
          actions: <Widget>[
            TextButton(
              onPressed: _submit,
              child: const Text(
                'Submit',
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
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: _buildForm(),
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: _buildFormChildren(),
      ),
    );
  }

  List<Widget> _buildFormChildren() {
    final fleets = ref.watch(currentClubProvider).current.fleets;
    return [
      FormBuilderTextField(
        name: 'name',
        autovalidateMode: AutovalidateMode.onUserInteraction,
        decoration: const InputDecoration(
          labelText: 'New name',
          helperText: "eg Summer",
        ),
        validator: FormBuilderValidators.required(),
      ),
      FormBuilderDropdown<String>(
        name: 'fleetId',
        initialValue: fleets[0].id,
        decoration: const InputDecoration(
          labelText: 'New fleet',
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
    ];
  }
}
