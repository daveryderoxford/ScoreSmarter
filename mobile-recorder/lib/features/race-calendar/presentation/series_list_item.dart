import 'package:flutter/material.dart';
import 'package:sailbrowser_flutter/features/race-calendar/domain/series.dart';
import 'package:sailbrowser_flutter/features/race-calendar/presentation/series_detail.dart';
import 'package:sailbrowser_flutter/util/date_time_extensions.dart';


class RaceSeriesListItem extends StatelessWidget {
  final Series series;


  const RaceSeriesListItem(this.series, {super.key});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Row(children: [
        Text(series.name),
        const SizedBox(width: 25),
        Text(series.fleetId),
      ]),
      subtitle: Row(
        children: [
          Text('${series.races.length} races'),
          const SizedBox(width: 25),
          series.startDate != null ? Text(
              '${series.startDate!.asDateString()} to ${series.endDate!.asDateString()}'): const Text(""),
        ],
      ),
      trailing: IconButton(
        icon: const Icon(Icons.edit_outlined),
        onPressed: () {
          // TODO use go route here
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => SeriesDetailScreen(
                series.id,
              ),
            ),
          );
        },
      ),
    );
  }
}
