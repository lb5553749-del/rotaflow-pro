package com.rotaflow.pro;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.Size;
import android.util.TypedValue;
import android.view.Display;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.core.resolutionselector.AspectRatioStrategy;
import androidx.camera.core.resolutionselector.ResolutionSelector;
import androidx.camera.core.resolutionselector.ResolutionStrategy;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Câmera dedicada (CameraX) numa Activity separada do MainActivity / Google Maps.
 * Várias fotos sem sair; Concluir devolve paths; Cancelar descarta.
 */
public class MultiCameraActivity extends AppCompatActivity {
    public static final String EXTRA_MAX_PHOTOS = "maxPhotos";
    public static final String EXTRA_PATHS = "paths";

    private static final int REQ_CAMERA = 4401;

    private PreviewView previewView;
    private ImageCapture imageCapture;
    private ExecutorService cameraExecutor;
    private ProcessCameraProvider cameraProvider;

    private TextView countLabel;
    private Button doneBtn;
    private View shutterBtn;
    private LinearLayout thumbsRow;
    private View flashOverlay;

    private final ArrayList<File> captured = new ArrayList<>();
    private int maxPhotos = 30;
    private boolean capturing = false;
    /** Ignore ghost second click / duplicate OnImageSaved for the same shutter press. */
    private long lastShutterAt = 0L;
    private int captureSeq = 0;
    private int activeCaptureSeq = 0;
    /** ACTION_DOWN must arm before ACTION_UP may fire takePhoto (blocks ghost UP). */
    private boolean shutterArmed = false;
    private static final long SHUTTER_COOLDOWN_MS = 800L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        maxPhotos = Math.max(1, Math.min(30, getIntent().getIntExtra(EXTRA_MAX_PHOTOS, 30)));
        cameraExecutor = Executors.newSingleThreadExecutor();

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.parseColor("#0B1220"));
        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(false);
        }

        setContentView(buildUi());

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.CAMERA }, REQ_CAMERA);
        } else {
            startCamera();
        }
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private View buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.setBackgroundColor(Color.parseColor("#0B1220"));

        previewView = new PreviewView(this);
        previewView.setImplementationMode(PreviewView.ImplementationMode.PERFORMANCE);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        root.addView(previewView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        flashOverlay = new View(this);
        flashOverlay.setBackgroundColor(Color.WHITE);
        flashOverlay.setAlpha(0f);
        flashOverlay.setClickable(false);
        root.addView(flashOverlay, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(14), dp(12), dp(14), dp(12));
        GradientDrawable topBg = new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[] { Color.parseColor("#99000000"), Color.TRANSPARENT });
        top.setBackground(topBg);

        Button cancelBtn = chipButton("Cancelar");
        cancelBtn.setOnClickListener(v -> cancelAndFinish());
        countLabel = new TextView(this);
        countLabel.setText("0 fotos");
        countLabel.setTextColor(Color.WHITE);
        countLabel.setTypeface(Typeface.DEFAULT_BOLD);
        countLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        countLabel.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams countLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        countLabel.setLayoutParams(countLp);

        // spacer mirror for cancel width balance
        TextView spacer = new TextView(this);
        spacer.setText("Cancelar");
        spacer.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        spacer.setTypeface(Typeface.DEFAULT_BOLD);
        spacer.setVisibility(View.INVISIBLE);
        spacer.setPadding(dp(14), dp(10), dp(14), dp(10));

        top.addView(cancelBtn);
        top.addView(countLabel);
        top.addView(spacer);

        View flex = new View(this);
        LinearLayout.LayoutParams flexLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        flex.setLayoutParams(flexLp);

        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.HORIZONTAL);
        bottom.setGravity(Gravity.CENTER_VERTICAL);
        bottom.setPadding(dp(16), dp(14), dp(16), dp(18));
        bottom.setBackgroundColor(Color.parseColor("#0B1220"));

        HorizontalScrollView thumbsScroll = new HorizontalScrollView(this);
        thumbsScroll.setHorizontalScrollBarEnabled(false);
        LinearLayout.LayoutParams thumbsScrollLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        thumbsScroll.setLayoutParams(thumbsScrollLp);
        thumbsRow = new LinearLayout(this);
        thumbsRow.setOrientation(LinearLayout.HORIZONTAL);
        thumbsRow.setGravity(Gravity.CENTER_VERTICAL);
        thumbsScroll.addView(thumbsRow);

        shutterBtn = buildShutter();
        LinearLayout.LayoutParams shutterLp = new LinearLayout.LayoutParams(dp(74), dp(74));
        shutterLp.setMargins(dp(10), 0, dp(10), 0);
        shutterBtn.setLayoutParams(shutterLp);
        // Touch-only shutter: avoids OEM double-fire of click (or click+touch) → 2 photos / press.
        shutterBtn.setOnClickListener(null);
        shutterBtn.setOnTouchListener((v, event) -> {
            final int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN) {
                shutterArmed = true;
                v.setPressed(true);
                return true;
            }
            if (action == MotionEvent.ACTION_CANCEL
                || action == MotionEvent.ACTION_POINTER_UP) {
                shutterArmed = false;
                v.setPressed(false);
                return true;
            }
            if (action == MotionEvent.ACTION_UP) {
                v.setPressed(false);
                if (shutterArmed) {
                    shutterArmed = false;
                    takePhoto();
                }
                return true;
            }
            return true;
        });

        doneBtn = new Button(this);
        doneBtn.setText("Concluir");
        doneBtn.setAllCaps(false);
        doneBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        doneBtn.setTypeface(Typeface.DEFAULT_BOLD);
        doneBtn.setPadding(dp(14), dp(12), dp(14), dp(12));
        styleDone(false);
        doneBtn.setOnClickListener(v -> finishWithPhotos());
        doneBtn.setEnabled(false);

        LinearLayout.LayoutParams doneLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        doneBtn.setLayoutParams(doneLp);

        bottom.addView(thumbsScroll);
        bottom.addView(shutterBtn);
        bottom.addView(doneBtn);

        column.addView(top, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        column.addView(flex);
        column.addView(bottom, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        root.addView(column);

        ViewCompat.setOnApplyWindowInsetsListener(column, (v, insets) -> {
            androidx.core.graphics.Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            top.setPadding(dp(14), sys.top + dp(10), dp(14), dp(10));
            bottom.setPadding(dp(16), dp(14), dp(16), sys.bottom + dp(14));
            return insets;
        });

        updateUi();
        return root;
    }

    private Button chipButton(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setPadding(dp(14), dp(10), dp(14), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#730F172A"));
        bg.setCornerRadius(dp(12));
        b.setBackground(bg);
        return b;
    }

    private View buildShutter() {
        FrameLayout ring = new FrameLayout(this);
        GradientDrawable outer = new GradientDrawable();
        outer.setShape(GradientDrawable.OVAL);
        outer.setStroke(dp(4), Color.WHITE);
        outer.setColor(Color.TRANSPARENT);
        ring.setBackground(outer);

        View inner = new View(this);
        GradientDrawable fill = new GradientDrawable();
        fill.setShape(GradientDrawable.OVAL);
        fill.setColor(Color.WHITE);
        inner.setBackground(fill);
        inner.setClickable(false);
        inner.setFocusable(false);
        FrameLayout.LayoutParams innerLp = new FrameLayout.LayoutParams(dp(58), dp(58), Gravity.CENTER);
        ring.addView(inner, innerLp);
        ring.setClickable(true);
        ring.setFocusable(true);
        return ring;
    }

    private void styleDone(boolean enabled) {
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(12));
        if (enabled) {
            bg.setColor(Color.parseColor("#22C55E"));
            doneBtn.setTextColor(Color.parseColor("#052E16"));
        } else {
            bg.setColor(Color.parseColor("#334155"));
            doneBtn.setTextColor(Color.parseColor("#94A3B8"));
        }
        doneBtn.setBackground(bg);
    }

    private void updateUi() {
        int n = captured.size();
        if (n >= maxPhotos) {
            countLabel.setText(n + " fotos (máx.)");
        } else if (n == 1) {
            countLabel.setText("1 foto");
        } else {
            countLabel.setText(n + " fotos");
        }
        boolean has = n > 0;
        doneBtn.setEnabled(has);
        styleDone(has);
        shutterBtn.setEnabled(n < maxPhotos && !capturing);
        shutterBtn.setAlpha(n < maxPhotos ? 1f : 0.45f);
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                bindPreview(cameraProvider);
            } catch (Exception e) {
                Toast.makeText(this, "Não foi possível abrir a câmera", Toast.LENGTH_SHORT).show();
                cancelAndFinish();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    /**
     * Prefer snappy multi-shot: modest 4:3 stills + latency mode.
     * Final on-disk JPEG for WebView is further sized in native/bridge.js.
     */
    private static final Size CAPTURE_TARGET = new Size(1920, 1440);
    private static final int CAPTURE_JPEG_QUALITY = 82;

    private int currentDisplayRotation() {
        try {
            Display display = null;
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                display = getDisplay();
            }
            if (display == null) {
                display = getWindowManager().getDefaultDisplay();
            }
            if (display != null) return display.getRotation();
        } catch (Exception ignored) {}
        return Surface.ROTATION_0;
    }

    private void bindPreview(@NonNull ProcessCameraProvider provider) {
        provider.unbindAll();

        Preview preview = new Preview.Builder().build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        ResolutionSelector captureRes = new ResolutionSelector.Builder()
            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
            .setResolutionStrategy(new ResolutionStrategy(
                CAPTURE_TARGET,
                ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER
            ))
            .build();

        imageCapture = new ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .setResolutionSelector(captureRes)
            .setJpegQuality(CAPTURE_JPEG_QUALITY)
            .setTargetRotation(currentDisplayRotation())
            .build();

        CameraSelector selector = CameraSelector.DEFAULT_BACK_CAMERA;
        try {
            provider.bindToLifecycle(this, selector, preview, imageCapture);
        } catch (Exception e) {
            Toast.makeText(this, "Câmera traseira indisponível", Toast.LENGTH_SHORT).show();
            cancelAndFinish();
        }
    }

    private void takePhoto() {
        if (imageCapture == null || capturing) return;
        long now = System.currentTimeMillis();
        if (now - lastShutterAt < SHUTTER_COOLDOWN_MS) return;
        if (captured.size() >= maxPhotos) {
            Toast.makeText(this, "Limite de fotos atingido", Toast.LENGTH_SHORT).show();
            return;
        }
        lastShutterAt = now;
        capturing = true;
        final int seq = ++captureSeq;
        activeCaptureSeq = seq;
        shutterBtn.setEnabled(false);
        updateUi();

        try {
            imageCapture.setTargetRotation(currentDisplayRotation());
        } catch (Exception ignored) {}

        flashOverlay.animate().alpha(0.85f).setDuration(60).withEndAction(() ->
            flashOverlay.animate().alpha(0f).setDuration(120).start()
        ).start();

        File out;
        try {
            out = File.createTempFile("rf_cam_", ".jpg", getCacheDir());
        } catch (Exception e) {
            if (activeCaptureSeq == seq) {
                capturing = false;
                updateUi();
            }
            Toast.makeText(this, "Erro ao guardar foto", Toast.LENGTH_SHORT).show();
            return;
        }

        ImageCapture.OutputFileOptions options =
            new ImageCapture.OutputFileOptions.Builder(out).build();

        imageCapture.takePicture(options, cameraExecutor, new ImageCapture.OnImageSavedCallback() {
            @Override
            public void onImageSaved(@NonNull ImageCapture.OutputFileResults outputFileResults) {
                runOnUiThread(() -> {
                    if (activeCaptureSeq != seq) {
                        //noinspection ResultOfMethodCallIgnored
                        out.delete();
                        return;
                    }
                    capturing = false;
                    activeCaptureSeq = 0;
                    if (!captured.contains(out)) {
                        captured.add(out);
                        appendThumb(out);
                    }
                    updateUi();
                    if (captured.size() >= maxPhotos) {
                        Toast.makeText(MultiCameraActivity.this, captured.size() + " fotos (máximo)", Toast.LENGTH_SHORT).show();
                    }
                });
            }

            @Override
            public void onError(@NonNull ImageCaptureException exception) {
                runOnUiThread(() -> {
                    //noinspection ResultOfMethodCallIgnored
                    out.delete();
                    if (activeCaptureSeq != seq) return;
                    capturing = false;
                    activeCaptureSeq = 0;
                    updateUi();
                    Toast.makeText(MultiCameraActivity.this, "Não foi possível capturar", Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    private void appendThumb(File file) {
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getAbsolutePath(), opts);
        int maxSide = Math.max(opts.outWidth, opts.outHeight);
        int sample = 1;
        while (maxSide / sample > 160) sample *= 2;
        opts.inJustDecodeBounds = false;
        opts.inSampleSize = Math.max(1, sample);
        Bitmap bmp = BitmapFactory.decodeFile(file.getAbsolutePath(), opts);
        if (bmp == null) return;

        ImageView img = new ImageView(this);
        img.setScaleType(ImageView.ScaleType.CENTER_CROP);
        img.setImageBitmap(bmp);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(40), dp(40));
        lp.setMargins(0, 0, dp(6), 0);
        img.setLayoutParams(lp);
        GradientDrawable border = new GradientDrawable();
        border.setCornerRadius(dp(8));
        border.setStroke(dp(2), Color.parseColor("#59FFFFFF"));
        border.setColor(Color.parseColor("#020617"));
        img.setBackground(border);
        img.setPadding(dp(1), dp(1), dp(1), dp(1));
        thumbsRow.addView(img);
        thumbsRow.post(() -> {
            View parent = (View) thumbsRow.getParent();
            if (parent instanceof HorizontalScrollView) {
                ((HorizontalScrollView) parent).fullScroll(View.FOCUS_RIGHT);
            }
        });
    }

    private void finishWithPhotos() {
        if (captured.isEmpty()) {
            cancelAndFinish();
            return;
        }
        ArrayList<String> paths = new ArrayList<>();
        for (File f : captured) {
            if (f != null && f.exists()) paths.add(f.getAbsolutePath());
        }
        Intent data = new Intent();
        data.putStringArrayListExtra(EXTRA_PATHS, paths);
        setResult(RESULT_OK, data);
        finish();
    }

    private void cancelAndFinish() {
        for (File f : captured) {
            try {
                if (f != null) //noinspection ResultOfMethodCallIgnored
                    f.delete();
            } catch (Exception ignored) {}
        }
        captured.clear();
        setResult(RESULT_CANCELED);
        finish();
    }

    @Override
    public void onBackPressed() {
        cancelAndFinish();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCamera();
            } else {
                Toast.makeText(this, "Permissão da câmera necessária", Toast.LENGTH_SHORT).show();
                cancelAndFinish();
            }
        }
    }

    @Override
    protected void onDestroy() {
        if (cameraProvider != null) {
            try { cameraProvider.unbindAll(); } catch (Exception ignored) {}
        }
        if (cameraExecutor != null) {
            cameraExecutor.shutdown();
        }
        super.onDestroy();
    }
}
