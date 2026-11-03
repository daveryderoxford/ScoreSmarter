import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sailbrowser_flutter/common_widgets/responsive_center.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series_service.dart';

import 'series_edit.dart';
import 'series_list_item.dart';

class SeriesScreen extends ConsumerWidget {
  const SeriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final allSeries = ref.watch(allSeriesProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Series'),
      ),
      body: ResponsiveCenter(
        maxContentWidth: 850,
        child: allSeries.when(
            loading: () => const CircularProgressIndicator(),
            error: (error, stackTrace) => Text(error.toString()),
            data: (series) {
              // Display all the messages in a scrollable list view.
              return ListView.builder(
                itemCount: series.length,
                itemBuilder: (context, index) =>
                    RaceSeriesListItem(series[index]),
              );
            }),
      ),
      floatingActionButton: FloatingActionButton(
        child: const Icon(Icons.add),
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => const EditSeries(
                id: '',
              ),
            ),
          );
        },
      ),
    );
  }
}
