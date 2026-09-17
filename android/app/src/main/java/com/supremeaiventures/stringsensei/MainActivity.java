package com.supremeaiventures.stringsensei;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final int AUDIO_PERMISSION_REQUEST = 1001;
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String APP_URL = "https://" + APP_HOST + "/assets/index.html";

    private WebView webView;
    private PermissionRequest pendingPermissionRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(17, 17, 17));
        getWindow().setNavigationBarColor(Color.rgb(17, 17, 17));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(17, 17, 17));
        configureWebView(webView);
        setContentView(webView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setTextZoom(100);

        view.setWebViewClient(new LocalAppWebViewClient());
        view.setWebChromeClient(new AppChromeClient());
    }

    private boolean isAppOrigin(Uri origin) {
        return origin != null
                && "https".equalsIgnoreCase(origin.getScheme())
                && APP_HOST.equalsIgnoreCase(origin.getHost());
    }

    private void handlePermissionRequest(PermissionRequest request) {
        if (!isAppOrigin(request.getOrigin())) {
            request.deny();
            return;
        }

        for (String resource : request.getResources()) {
            if (!PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                request.deny();
                return;
            }
        }

        pendingPermissionRequest = request;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            grantPendingAudioPermission();
        } else {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_REQUEST);
        }
    }

    private void grantPendingAudioPermission() {
        PermissionRequest request = pendingPermissionRequest;
        pendingPermissionRequest = null;
        if (request != null && !isAppOrigin(request.getOrigin())) {
            request.deny();
            return;
        }
        if (request != null) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != AUDIO_PERMISSION_REQUEST) return;

        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            grantPendingAudioPermission();
        } else if (pendingPermissionRequest != null) {
            pendingPermissionRequest.deny();
            pendingPermissionRequest = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (pendingPermissionRequest != null) {
            pendingPermissionRequest.deny();
            pendingPermissionRequest = null;
        }
        webView.stopLoading();
        webView.destroy();
        super.onDestroy();
    }

    private final class AppChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> handlePermissionRequest(request));
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            return false;
        }
    }

    private final class LocalAppWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return loadAsset(request.getUrl());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return loadAsset(Uri.parse(url));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isAppOrigin(uri)) return false;
            openExternalUrl(uri);
            return true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = Uri.parse(url);
            if (isAppOrigin(uri)) return false;
            openExternalUrl(uri);
            return true;
        }

        private WebResourceResponse loadAsset(Uri uri) {
            if (!isAppOrigin(uri)) return null;

            String path = uri.getPath();
            if (path == null || !path.startsWith("/assets/")) return null;

            String assetPath = Uri.decode(path.substring("/assets/".length()));
            if (assetPath.isEmpty()) assetPath = "index.html";
            if (assetPath.contains("..") || assetPath.startsWith("/")) return null;

            try {
                InputStream stream = getAssets().open(assetPath);
                return new WebResourceResponse(mimeType(assetPath), textEncoding(assetPath), stream);
            } catch (IOException ignored) {
                return null;
            }
        }

        private void openExternalUrl(Uri uri) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
                // Keep an unavailable external handler from crashing the tuner.
            }
        }

        private String mimeType(String path) {
            String lowerPath = path.toLowerCase(Locale.US);
            if (lowerPath.endsWith(".html")) return "text/html";
            if (lowerPath.endsWith(".js")) return "text/javascript";
            if (lowerPath.endsWith(".css")) return "text/css";
            if (lowerPath.endsWith(".webmanifest")) return "application/manifest+json";
            if (lowerPath.endsWith(".json")) return "application/json";
            if (lowerPath.endsWith(".svg")) return "image/svg+xml";
            if (lowerPath.endsWith(".png")) return "image/png";
            if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) return "image/jpeg";
            if (lowerPath.endsWith(".ico")) return "image/x-icon";
            return "application/octet-stream";
        }

        private String textEncoding(String path) {
            String lowerPath = path.toLowerCase(Locale.US);
            if (lowerPath.endsWith(".html")
                    || lowerPath.endsWith(".js")
                    || lowerPath.endsWith(".css")
                    || lowerPath.endsWith(".webmanifest")
                    || lowerPath.endsWith(".json")
                    || lowerPath.endsWith(".svg")) {
                return "UTF-8";
            }
            return null;
        }
    }
}
