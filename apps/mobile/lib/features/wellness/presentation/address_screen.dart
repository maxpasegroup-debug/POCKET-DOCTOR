import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../application/commerce_providers.dart';
import '../domain/commerce_models.dart';
import 'commerce_widgets.dart';

class AddressScreen extends ConsumerWidget {
  const AddressScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final action = ref.watch(commerceActionsProvider);
    return CommercePage(
      title: 'Delivery addresses',
      children: [
        CommerceActionState(value: action),
        FilledButton.icon(
          onPressed: action.isLoading
              ? null
              : () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const AddressEditor(),
                  ),
                ),
          icon: const Icon(Icons.add),
          label: const Text('Add address'),
        ),
        const SizedBox(height: 24),
        CommerceAsync(
          value: ref.watch(addressesProvider),
          retry: () => ref.invalidate(addressesProvider),
          builder: (addresses) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (addresses.isEmpty)
                const CommerceEmpty(
                  title: 'No saved addresses',
                  message:
                      'Add a delivery address when you are ready to check out.',
                ),
              for (final a in addresses)
                Padding(
                  padding: const EdgeInsets.only(bottom: 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (a.isDefault) const Text('Default address'),
                      Text(a.summary),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          TextButton(
                            onPressed: action.isLoading
                                ? null
                                : () => Navigator.of(context).push(
                                    MaterialPageRoute<void>(
                                      builder: (_) => AddressEditor(address: a),
                                    ),
                                  ),
                            child: const Text('Edit'),
                          ),
                          if (!a.isDefault)
                            TextButton(
                              onPressed: action.isLoading
                                  ? null
                                  : () => ref
                                        .read(commerceActionsProvider.notifier)
                                        .run(
                                          (r) => r.saveAddress({
                                            ...a.toJson(),
                                            'isDefault': true,
                                          }, a.id),
                                        ),
                              child: const Text('Set default'),
                            ),
                          TextButton(
                            onPressed: action.isLoading
                                ? null
                                : () async {
                                    final yes = await showDialog<bool>(
                                      context: context,
                                      builder: (c) => AlertDialog(
                                        title: const Text(
                                          'Delete this address?',
                                        ),
                                        content: const Text(
                                          'Existing order addresses will remain in your order history.',
                                        ),
                                        actions: [
                                          TextButton(
                                            onPressed: () =>
                                                Navigator.pop(c, false),
                                            child: const Text('Keep'),
                                          ),
                                          FilledButton(
                                            onPressed: () =>
                                                Navigator.pop(c, true),
                                            child: const Text('Delete'),
                                          ),
                                        ],
                                      ),
                                    );
                                    if (yes == true && context.mounted) {
                                      await ref
                                          .read(
                                            commerceActionsProvider.notifier,
                                          )
                                          .run((r) => r.deleteAddress(a.id));
                                    }
                                  },
                            child: const Text('Delete'),
                          ),
                        ],
                      ),
                      const Divider(),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class AddressEditor extends ConsumerStatefulWidget {
  const AddressEditor({super.key, this.address});
  final DeliveryAddress? address;
  @override
  ConsumerState<AddressEditor> createState() => _AddressEditorState();
}

class _AddressEditorState extends ConsumerState<AddressEditor> {
  final form = GlobalKey<FormState>();
  late final Map<String, TextEditingController> fields;
  bool isDefault = false;
  static const labels = {
    'fullName': 'Full name',
    'phone': 'Mobile number (+91)',
    'line1': 'Address line 1',
    'line2': 'Address line 2 (optional)',
    'city': 'City',
    'state': 'State',
    'pinCode': 'PIN code',
  };
  @override
  void initState() {
    super.initState();
    fields = {
      for (final key in labels.keys)
        key: TextEditingController(
          text: widget.address?.toJson()[key] as String? ?? '',
        ),
    };
    isDefault = widget.address?.isDefault ?? false;
  }

  @override
  void dispose() {
    for (final c in fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(commerceActionsProvider);
    return CommercePage(
      title: widget.address == null ? 'Add address' : 'Edit address',
      children: [
        const Text(
          'Delivery addresses are private to your account. India is the current supported market.',
        ),
        const SizedBox(height: 20),
        Form(
          key: form,
          child: Column(
            children: [
              for (final entry in labels.entries)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: TextFormField(
                    controller: fields[entry.key],
                    decoration: InputDecoration(labelText: entry.value),
                    keyboardType: entry.key == 'phone'
                        ? TextInputType.phone
                        : entry.key == 'pinCode'
                        ? TextInputType.number
                        : TextInputType.streetAddress,
                    maxLength: entry.key == 'phone'
                        ? 13
                        : entry.key == 'pinCode'
                        ? 6
                        : entry.key.startsWith('line')
                        ? 200
                        : 100,
                    validator: (value) {
                      final v = value?.trim() ?? '';
                      if (entry.key == 'line2') return null;
                      if (v.isEmpty) {
                        return 'Please enter ${entry.value.toLowerCase()}.';
                      }
                      if (entry.key == 'phone' &&
                          !RegExp(r'^\+91[6-9]\d{9}$').hasMatch(v)) {
                        return 'Use +91 followed by a valid 10-digit number.';
                      }
                      if (entry.key == 'pinCode' &&
                          !RegExp(r'^[1-9]\d{5}$').hasMatch(v)) {
                        return 'Enter a valid six-digit PIN code.';
                      }
                      return null;
                    },
                  ),
                ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: isDefault,
                onChanged: action.isLoading
                    ? null
                    : (v) => setState(() => isDefault = v!),
                title: const Text('Use as default address'),
              ),
              CommerceActionState(value: action),
              FilledButton(
                onPressed: action.isLoading
                    ? null
                    : () async {
                        if (!form.currentState!.validate()) return;
                        final result = await ref
                            .read(commerceActionsProvider.notifier)
                            .run(
                              (r) => r.saveAddress({
                                for (final entry in fields.entries)
                                  entry.key: entry.value.text.trim(),
                                'country': 'IN',
                                'isDefault': isDefault,
                              }, widget.address?.id),
                            );
                        if (context.mounted && result != null) {
                          Navigator.of(context).pop();
                        }
                      },
                child: const Text('Save address'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
