import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/foundation_widgets.dart';
import '../application/membership_providers.dart';
import '../domain/membership_models.dart';
import 'membership_widgets.dart';

class MembershipTransactionsScreen extends ConsumerStatefulWidget {
  const MembershipTransactionsScreen({super.key});
  @override
  ConsumerState<MembershipTransactionsScreen> createState() =>
      _TransactionsState();
}

class _TransactionsState extends ConsumerState<MembershipTransactionsScreen> {
  int page = 1;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Transactions & receipts')),
    body: PageBody(
      children: [
        MembershipAsync(
          value: ref.watch(membershipTransactionsProvider(page)),
          retry: () => ref.invalidate(membershipTransactionsProvider(page)),
          builder: (items) => Column(
            children: [
              if (items.isEmpty) const Text('No transactions yet.'),
              for (final item in items)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    '${membershipMoney(item['amountPaise'] as int)} · ${item['status']}',
                  ),
                  subtitle: Text(
                    '${item['subscriptionId'] != null
                        ? 'Membership'
                        : item['programId'] != null
                        ? 'Program'
                        : item['consultationId'] != null
                        ? 'Consultation'
                        : 'Wellness'} · ${membershipDate(item['createdAt'] as String)}${item['provider'] == 'development' ? '\nDEMO · No real charge' : ''}',
                  ),
                  trailing: item['invoice'] == null
                      ? null
                      : const Icon(Icons.receipt_long_outlined),
                  onTap: item['invoice'] == null
                      ? null
                      : () => context.push(
                          '/membership/invoices/${(item['invoice'] as Map)['id']}',
                        ),
                ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextButton(
                    onPressed: page > 1 ? () => setState(() => page--) : null,
                    child: const Text('Previous'),
                  ),
                  Text('Page $page'),
                  TextButton(
                    onPressed: items.length == 20
                        ? () => setState(() => page++)
                        : null,
                    child: const Text('Next'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class MembershipInvoiceScreen extends ConsumerWidget {
  const MembershipInvoiceScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: const Text('Payment receipt')),
    body: PageBody(
      children: [
        MembershipAsync(
          value: ref.watch(membershipInvoiceProvider(id)),
          retry: () => ref.invalidate(membershipInvoiceProvider(id)),
          builder: (item) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeading(
                eyebrow: 'POCKET DOCTOR',
                title: 'Your payment receipt',
                description: 'A record of your verified transaction.',
              ),
              if ((item['payment'] as Map)['provider'] == 'development')
                const Text('DEMO RECEIPT · No real money was charged.'),
              const SizedBox(height: 20),
              SelectableText(item['number'] as String),
              const SizedBox(height: 12),
              Text('${item['source']} · ${item['status']}'),
              Text(membershipDate(item['issuedAt'] as String)),
              const SizedBox(height: 20),
              Text(
                '${membershipMoney(item['amountPaise'] as int)} ${item['currency']}',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 20),
              const Text(
                'This is a payment record, not a configured tax invoice. Tax and refund processing require the relevant business and provider setup.',
              ),
            ],
          ),
        ),
      ],
    ),
  );
}
