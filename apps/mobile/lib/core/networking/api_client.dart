import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import 'health_repository.dart';

class ApiFailure implements Exception {
  const ApiFailure(this.message, {this.status, this.code});
  final String message;
  final int? status;
  final String? code;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient(this._http, this._base);
  final http.Client _http;
  final Uri _base;
  String? token;
  void Function()? onUnauthorized;

  Future<Map<String, dynamic>> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool authenticated = false,
    Map<String, String>? query,
  }) async {
    final requestToken = token;
    if (authenticated && requestToken == null) {
      throw const ApiFailure('Please sign in again.', status: 401);
    }
    try {
      final request = http.Request(
        method,
        _base.replace(path: '${_base.path}$path', queryParameters: query),
      );
      request.headers['Accept'] = 'application/json';
      if (authenticated) {
        request.headers['Authorization'] = 'Bearer $requestToken';
      }
      if (body != null) {
        request.headers['Content-Type'] = 'application/json';
        request.body = jsonEncode(body);
      }
      final response = await _http
          .send(request)
          .then(http.Response.fromStream)
          .timeout(const Duration(seconds: 12));
      if (response.statusCode == 401 &&
          authenticated &&
          token == requestToken) {
        onUnauthorized?.call();
      }
      final decoded = jsonDecode(response.body);
      if (response.statusCode >= 400) {
        String? code;
        if (decoded is Map && decoded['error'] is Map) {
          code = decoded['error']['code'] as String?;
        }
        final message = switch (code) {
          'AI_UNAVAILABLE' =>
            'Your Pocket Doctor Assistant is temporarily unavailable. You can still browse programs, consultations and wellness.',
          'AI_CONSENT_REQUIRED' =>
            'Allow chat processing in Assistant privacy & settings to continue.',
          'AI_HISTORY_LIMIT' =>
            'Start a new conversation or delete an old one to make space.',
          'AI_RECORD_LIMIT' => 'Remove an older saved item to make space.',
          'WHATSAPP_UNAVAILABLE' => 'WhatsApp connection is not available yet.',
          'LINK_INVALID' =>
            'This link is unavailable or expired. Generate a new code and check the account.',
          'STOCK_CHANGED' || 'CART_CHANGED' =>
            'Availability changed. Refresh your cart and review quantities.',
          'CHECKOUT_CHANGED' =>
            'Prices or address details changed. Refresh checkout and review the updated total.',
          'COMMERCE_UNAVAILABLE' =>
            'Ordering will open when payment and delivery services are ready.',
          'ORDER_STATE' =>
            'This order is no longer awaiting payment. Refresh its status or return to your cart.',
          'CANCELLATION_POLICY' =>
            'This order can no longer be cancelled here. Please contact support.',
          'CART_LIMIT' => 'Your cart can contain up to 20 products.',
          'ADDRESS_LIMIT' => 'You can save up to 10 addresses.',
          'INVALID_STATE' =>
            'This action is not available for this appointment. Please refresh its status.',
          'FORBIDDEN' => 'Your account does not have access to this action.',
          'SLOT_UNAVAILABLE' =>
            'This time is no longer available. Please choose another slot.',
          'BOOKING_EXPIRED' =>
            'This reservation expired. Please choose another time.',
          'BOOKING_NOT_PENDING' =>
            'This reservation is no longer awaiting payment. Refresh to see its status.',
          'POLICY_WINDOW_CLOSED' =>
            'This appointment can no longer be changed. Please contact support.',
          'PROVIDER_UNAVAILABLE' =>
            'Consultation connection is not available yet.',
          'INVALID_DATE' => 'Choose a date within the next 30 days.',
          'NOT_FOUND' => 'This item is not available.',
          'PROGRAM_NOT_FOUND' => 'This program is not available.',
          'ENROLLMENT_REQUIRED' => 'Join this program to access its lessons.',
          'PAYMENT_REQUIRED' => 'Complete payment before joining this program.',
          'PAYMENT_UNAVAILABLE' => 'Payments are not available yet.',
          'PAYMENT_FAILED' =>
            'Payment could not be completed. Please try again.',
          'ALREADY_ENROLLED' => 'You have already joined this program.',
          'MEDIA_UNAVAILABLE' =>
            'This video is not available right now. Please try again later.',
          'INVALID_OTP' =>
            'That code is incorrect or expired. Try again or request a new code.',
          'OTP_RATE_LIMITED' =>
            'Please wait before requesting another code. Up to five codes are available per hour.',
          'OTP_UNAVAILABLE' =>
            'Sign-in is not available right now. Please try again later.',
          'INVALID_PROFILE' => 'Please check your name and profile choices.',
          _ => switch (response.statusCode) {
            401 => 'Your session has ended. Please sign in again.',
            429 => 'Too many attempts. Please wait a little and try again.',
            400 => 'Please check your details and try again.',
            _ => 'We could not connect right now. Please try again.',
          },
        };
        throw ApiFailure(message, status: response.statusCode, code: code);
      }
      if (decoded is! Map<String, dynamic> ||
          decoded['data'] is! Map<String, dynamic>) {
        throw const ApiFailure(
          'We could not read that response. Please try again.',
        );
      }
      return decoded['data'] as Map<String, dynamic>;
    } on ApiFailure {
      rethrow;
    } catch (_) {
      throw const ApiFailure(
        'Could not connect. Check your connection and try again.',
      );
    }
  }
}

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(
    ref.watch(httpClientProvider),
    ref.watch(appConfigProvider).apiBaseUri,
  ),
);
