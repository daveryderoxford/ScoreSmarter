
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:loggy/loggy.dart';
import 'package:sailbrowser_flutter/common_widgets/responsive_center.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series_service.dart';
import 'package:sailbrowser_flutter/features/race/domain/race_competitor.dart';
import 'package:sailbrowser_flutter/features/race/domain/race_competitor_service.dart';
import 'package:sailbrowser_flutter/features/race/entry/presentation/entry_add.dart';
import 'package:sailbrowser_flutter/features/race/entry/presentation/widgets/race_entries_list_item.dart';
import 'package:sailbrowser_flutter/util/list_extensions.dart';

typedef EntryRecord = ({Race race, List<RaceCompetitor> competitors});

class EntriesScreen extends ConsumerWidget with UiLoggy {
  const EntriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final competitorsProvider = ref.watch(currentCompetitors);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Entries'),
      ),
      body: ResponsiveCenter(
        maxContentWidth: 850,
        child: competitorsProvider.when(
          loading: () => const CircularProgressIndicator(),
          error: (error, stackTrace) {
            logError(
                'Error reading competiors:  $error stack trace : ${stackTrace.toString()}');
            return Text(error.toString());
          },
          data: (competitors) {
            if (competitors.isEmpty) {
              return const Center(
                child: Text(textScaleFactor: 1.2,'No entries for races today'),
              );
            } else {
              final entryMap = competitors.groupBy((comp) => comp.raceId);
      
              final entryList = <EntryRecord>[];
              entryMap.forEach((key, value) {
                var race = ref.watch(raceProvider(key));
                assert (race!=null, 'Competitor references raceId that does not exist. Race key: $key');
                race ??= Race(fleetId: 'No fleet', seriesId: 'Orphaned competitors', scheduledStart: DateTime.now(), raceOfDay: 0);
                entryList.add((race: race, competitors: value));
              });
              entryList.sort( (a, b) => SeriesService.sortRaces(a.race, b.race));
      
              return ListView.separated(
                itemCount: entryList.length,
                itemBuilder: (context, index) => RaceEntriesListItem(entryList[index]),
                separatorBuilder: (BuildContext context, int index) =>
                    const Divider(),
              );
            }
          },
        ),
      ),
      floatingActionButton: FloatingActionButton(
        child: const Icon(Icons.add),
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => const AddEntry(),
            ),
          );
        },
      ),
    );
  }
}
