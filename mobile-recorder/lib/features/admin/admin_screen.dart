import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:sailbrowser_flutter/routing/app_router.dart';

class AdminScreen extends StatelessWidget {
  AdminScreen({super.key});

  final items = [
    (
      name: 'Boats',
      description: 'Boats sailing at the club',
      route: AppRoute.boats.name
    ),
    (
      name: 'Race calendar',
      description: 'Seres and races',
      route: AppRoute.series.name
    ),
    (
      name: 'Fleets',
      description: 'Fleets of boats, both handicap and one-design',
      route: AppRoute.boats.name
    ),
    (
      name: 'Classes',
      description: 'Classes of boat and their handicaps',
      route: AppRoute.boats.name
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin'),
      ),
      body: ListView.separated(
        itemCount: items.length,
        separatorBuilder: (BuildContext context, int index) => const Divider(),
        itemBuilder: (BuildContext context, int index) {
          final item = items[index];
          return ListTile(
            title: Text(item.name),
            subtitle: Text(item.description),
            trailing: IconButton(
                icon: const Icon(Icons.arrow_right_outlined),
                onPressed: () => context.goNamed(item.route)),
          );
        },
      ),
    );
  }
}
