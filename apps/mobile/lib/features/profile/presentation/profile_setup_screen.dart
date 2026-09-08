import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../shared/widgets/phase_one_widgets.dart';
import '../../auth/application/auth_controller.dart';
import '../domain/user_profile.dart';

class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({super.key, this.editing = false});
  final bool editing;
  @override
  ConsumerState<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  String _language = 'en';
  final Set<String> _interests = {};
  @override
  void initState() {
    super.initState();
    final user = ref.read(currentUserProvider);
    _name.text = user?.fullName ?? '';
    _language = user?.language ?? 'en';
    _interests.addAll(user?.interests ?? []);
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) {
      return;
    }
    final saved = await ref
        .read(authProvider.notifier)
        .saveProfile(
          ProfileDraft(
            fullName: _name.text,
            language: _language,
            interests: _interests.toList(),
            notifications:
                ref.read(currentUserProvider)?.notifications ?? false,
          ),
        );
    if (saved && mounted && widget.editing) {
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    return DetailPage(
      title: widget.editing ? 'Edit profile' : 'Make yourself at home',
      children: [
        Text(
          widget.editing
              ? 'Your profile, your way.'
              : 'Let’s make this space yours.',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 12),
        const Text('Just the basics. No medical history needed.'),
        const SizedBox(height: 32),
        Form(
          key: _form,
          child: Column(
            children: [
              TextFormField(
                key: const Key('name-input'),
                controller: _name,
                enabled: !auth.busy,
                textCapitalization: TextCapitalization.words,
                autofillHints: const [AutofillHints.name],
                maxLength: 100,
                decoration: const InputDecoration(
                  labelText: 'Full name',
                  border: OutlineInputBorder(),
                ),
                validator: ProfileDraft.validateName,
              ),
              const SizedBox(height: 20),
              DropdownButtonFormField<String>(
                initialValue: _language,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Preferred language',
                  border: OutlineInputBorder(),
                ),
                items: [
                  for (final entry in supportedLanguages.entries)
                    DropdownMenuItem(
                      value: entry.key,
                      child: Text(entry.value),
                    ),
                ],
                onChanged: auth.busy
                    ? null
                    : (value) => setState(() => _language = value!),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          'We’ll remember your preference. The app is currently available in English.',
        ),
        const PageSection(
          'What matters to you?',
          subtitle:
              'Optional wellness interests. Choose any, or leave them empty. You can change or remove them later.',
        ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final interest in wellnessInterests)
              FilterChip(
                label: Text(interest),
                selected: _interests.contains(interest),
                onSelected: auth.busy
                    ? null
                    : (selected) => setState(() {
                        selected
                            ? _interests.add(interest)
                            : _interests.remove(interest);
                      }),
              ),
          ],
        ),
        if (auth.error != null) ErrorNotice(message: auth.error!),
        const SizedBox(height: 32),
        ActionButton(
          label: widget.editing ? 'Save changes' : 'Enter my health space',
          busy: auth.busy,
          onPressed: _save,
        ),
        if (!widget.editing)
          TextButton(
            onPressed: auth.busy
                ? null
                : ref.read(authProvider.notifier).logout,
            child: const Text('Sign out'),
          ),
      ],
    );
  }
}
