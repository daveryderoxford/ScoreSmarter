import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:sailbrowser_flutter/common_widgets/delete_button.dart';
import 'package:sailbrowser_flutter/common_widgets/responsive_center.dart';
import 'package:sailbrowser_flutter/constants/app_sizes.dart';
import 'package:sailbrowser_flutter/features/club/domain/clubs_service.dart';
import 'package:sailbrowser_flutter/features/club/domain/fleet.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series_service.dart';
import 'package:sailbrowser_flutter/features/race-calendar/presentation/copy_series.dart';
import 'package:sailbrowser_flutter/features/race-calendar/presentation/race_edit.dart';
import 'package:sailbrowser_flutter/features/race-calendar/presentation/series_edit.dart';
import 'package:sailbrowser_flutter/util/date_time_extensions.dart';

class SeriesDetailScreen extends ConsumerWidget {
  final String seriesId;

  const SeriesDetailScreen(this.seriesId, {super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final club = ref.read(currentClubProvider).current;
    Series? series;

    final allSeries = ref.watch(allSeriesProvider);
    allSeries.when(
        data: (allSeries) =>
            series = allSeries.where((s) => s.id == seriesId).firstOrNull,
        error: (obj, stack) {
          return const Center(child: Text('Some error occurred'));
        },
        loading: () => const Center(child: CircularProgressIndicator()));

    if (series == null) {
      return const Text("Series not found");
    } else {
      return Scaffold(
        appBar: AppBar(title: const Text('Series Detail'), actions: [
          IconButton(
            onPressed: () => {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => CopySeries(series: series),
                ),
              )
            },
            icon: const Icon(Icons.copy_all_outlined),
            tooltip: 'Copy Series',
          ),
        ]),
        body: ResponsiveCenter(
          maxContentWidth: 850,
          child: Column(
            children: [
              _seriesCard(context, series!, club.fleets),
              _racesHeader(context, series!),
              _racesList(series!),
              DeleteButton(
                title: 'Delete Series',
                itemName: 'series',
                visible: true,
                onDelete: () async {
                  final raceSeriesService = ref.read(seriesRepositoryProvider);
                  await raceSeriesService.remove(series!.id);
        
                  if (context.mounted) {
                    context.pop();
                  }
                },
              ),
            ],
          ),
        ),
      );
    }
  }

  Widget _seriesCard(BuildContext context, Series series, List<Fleet> fleets) {
    final fleetName = fleets.firstWhere((f) => f.id == series.fleetId).name;
    final seriesDuration = series.races.isNotEmpty
        ? '${series.startDate!.asDateString()} to ${series.endDate!.asDateString()}'
        : "";

    return Card(
      color: Theme.of(context).colorScheme.surfaceVariant,
      child: Container(
        padding: const EdgeInsets.all(8.0),
        alignment: Alignment.centerLeft,
        child: ListTile(
          title: Row(children: [
            Text(fleetName),
            const SizedBox(width: 20),
            Text(series.name),
          ]),
          subtitle: Text(seriesDuration),
          trailing: IconButton(
            onPressed: () => {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) =>
                      EditSeries(series: series, id: series.id),
                ),
              )
            },
            icon: const Icon(Icons.edit),
          ),
        ),
      ),
    );
  }

  Widget _racesHeader(BuildContext context, Series series) {
    return ListTile(
      title: const Center(child: Text(textScaleFactor: 1.3, "Races")),
      trailing: IconButton(
        icon: const Icon(Icons.add_circle_outline_outlined),
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) =>
                  EditRace(race: null, series: series, id: 'not_set'),
            ),
          );
        },
      ),
    );
  }

  Widget _racesList(Series series) {
    final races = series.races;

    if (races.isEmpty) {
      return const Center(
          child: Text(textScaleFactor: 1.2, 'No races to display'));
    } else {
      return Expanded(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8.0),
          child: ListView.separated(
              itemCount: races.length,
              separatorBuilder: (BuildContext context, int index) =>
                  const Divider(),
              itemBuilder: (BuildContext context, int index) {
                final race = races[index];
                final avgLap = race.isAverageLap ? 'Average lap' : '';
                final date = race.scheduledStart.asDayDate();
                final startTime =
                    'Start:  ${race.scheduledStart.asHourMin()}';
                final status = race.status.displayName;
                final type = race.type != RaceType.conventional
                    ? race.type.displayName
                    : "";

                return ListTile(
                  isThreeLine: true,
                  title: Row(
                    children: [
                      Text(race.name),
                      gapW20,
                      Text(date),

                    ],
                  ),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(startTime),             
                      Row(
                        children: [
                          Text(status),
                          gapW20,
                          Text(type),
                          gapW20,
                          Text(avgLap),
                        ],
                      ),
                    ],
                  ),
                  trailing: IconButton(
                    onPressed: () => {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) =>
                              EditRace(race: race, series: series, id: race.id),
                        ),
                      )
                    },
                    icon: const Icon(Icons.edit),
                  ),
                );
              }),
        ),
      );
    }
  }
}
