package com.rotaflow.pro;

import android.util.Base64;
import android.util.Log;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Security;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.bouncycastle.jce.ECNamedCurveTable;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.jce.spec.ECNamedCurveParameterSpec;
import org.bouncycastle.jce.spec.ECNamedCurveSpec;

/**
 * Web Push (RFC 8291 / 8292) para avisar o cliente com o app do motorista
 * em segundo plano ou encerrado.
 */
final class WebPushSender {
    private static final String TAG = "RotaFlowPush";
    private static final SecureRandom RANDOM = new SecureRandom();

    static {
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
    }

    private WebPushSender() {}

    static boolean send(
        String endpoint,
        String p256dh,
        String auth,
        String jsonPayload,
        String vapidPublic,
        String vapidPrivate,
        String subject
    ) {
        if (isBlank(endpoint) || isBlank(p256dh) || isBlank(auth)
            || isBlank(vapidPublic) || isBlank(vapidPrivate)) {
            return false;
        }
        HttpURLConnection conn = null;
        try {
            byte[] body = encryptAes128Gcm(jsonPayload == null ? "{}" : jsonPayload, p256dh, auth);
            String jwt = vapidJwt(endpoint, vapidPrivate, subject == null ? "mailto:rotaflow@web.app" : subject);
            conn = (HttpURLConnection) new URL(endpoint).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(12000);
            conn.setReadTimeout(12000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Authorization", "vapid t=" + jwt + ", k=" + vapidPublic);
            conn.setRequestProperty("Content-Encoding", "aes128gcm");
            conn.setRequestProperty("Content-Type", "application/octet-stream");
            conn.setRequestProperty("TTL", "3600");
            conn.setRequestProperty("Urgency", "high");
            conn.setFixedLengthStreamingMode(body.length);
            OutputStream os = conn.getOutputStream();
            os.write(body);
            os.close();
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                Log.w(TAG, "push http " + code);
                return false;
            }
            return true;
        } catch (Exception e) {
            Log.w(TAG, "push fail", e);
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static byte[] encryptAes128Gcm(String json, String p256dh, String auth) throws Exception {
        byte[] uaPublic = b64UrlDecode(p256dh);
        byte[] authSecret = b64UrlDecode(auth);
        KeyPair asKeys = generateP256();
        byte[] asPublic = uncompressed((ECPublicKey) asKeys.getPublic());
        byte[] ecdh = ecdh(asKeys.getPrivate(), uaPublic);
        byte[] webPushInfo = concat("WebPush: info".getBytes(StandardCharsets.US_ASCII), new byte[]{0}, uaPublic, asPublic);
        byte[] ikm = hkdf(authSecret, ecdh, webPushInfo, 32);
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        byte[] cek = hkdf(salt, ikm, concat("Content-Encoding: aes128gcm".getBytes(StandardCharsets.US_ASCII), new byte[]{0}), 16);
        byte[] nonce = hkdf(salt, ikm, concat("Content-Encoding: nonce".getBytes(StandardCharsets.US_ASCII), new byte[]{0}), 12);
        byte[] plain = json.getBytes(StandardCharsets.UTF_8);
        byte[] padded = new byte[plain.length + 1];
        System.arraycopy(plain, 0, padded, 0, plain.length);
        padded[plain.length] = 0x02;
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] ciphertext = cipher.doFinal(padded);
        ByteBuffer out = ByteBuffer.allocate(16 + 4 + 1 + asPublic.length + ciphertext.length);
        out.put(salt);
        out.putInt(4096);
        out.put((byte) asPublic.length);
        out.put(asPublic);
        out.put(ciphertext);
        return out.array();
    }

    private static String vapidJwt(String endpoint, String vapidPrivate, String subject) throws Exception {
        String aud = originOf(endpoint);
        long exp = System.currentTimeMillis() / 1000L + 12L * 3600L;
        String header = b64Url("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.US_ASCII));
        String payload = b64Url((
            "{\"aud\":\"" + aud + "\",\"exp\":" + exp + ",\"sub\":\"" + subject + "\"}"
        ).getBytes(StandardCharsets.US_ASCII));
        String signingInput = header + "." + payload;
        byte[] sig = signEs256(signingInput.getBytes(StandardCharsets.US_ASCII), vapidPrivate);
        return signingInput + "." + b64Url(sig);
    }

    private static byte[] signEs256(byte[] data, String vapidPrivate) throws Exception {
        ECNamedCurveParameterSpec spec = ECNamedCurveTable.getParameterSpec("secp256r1");
        ECNamedCurveSpec params = new ECNamedCurveSpec("secp256r1", spec.getCurve(), spec.getG(), spec.getN(), spec.getH());
        byte[] raw = b64UrlDecode(vapidPrivate);
        ECPrivateKeySpec keySpec = new ECPrivateKeySpec(new BigInteger(1, raw), params);
        PrivateKey key = KeyFactory.getInstance("EC", "BC").generatePrivate(keySpec);
        try {
            Signature plain = Signature.getInstance("SHA256withPLAIN-ECDSA", "BC");
            plain.initSign(key);
            plain.update(data);
            return plain.sign();
        } catch (Exception ignored) {
            Signature der = Signature.getInstance("SHA256withECDSA", "BC");
            der.initSign(key);
            der.update(data);
            return derToJose(der.sign());
        }
    }

    private static byte[] ecdh(PrivateKey localPrivate, byte[] uaUncompressed) throws Exception {
        ECNamedCurveParameterSpec spec = ECNamedCurveTable.getParameterSpec("secp256r1");
        ECNamedCurveSpec params = new ECNamedCurveSpec("secp256r1", spec.getCurve(), spec.getG(), spec.getN(), spec.getH());
        org.bouncycastle.math.ec.ECPoint q = spec.getCurve().decodePoint(uaUncompressed);
        ECPublicKeySpec pubSpec = new ECPublicKeySpec(
            new ECPoint(q.getAffineXCoord().toBigInteger(), q.getAffineYCoord().toBigInteger()),
            params
        );
        PublicKey uaKey = KeyFactory.getInstance("EC", "BC").generatePublic(pubSpec);
        KeyAgreement ka = KeyAgreement.getInstance("ECDH", "BC");
        ka.init(localPrivate);
        ka.doPhase(uaKey, true);
        return ka.generateSecret();
    }

    private static KeyPair generateP256() throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC", "BC");
        kpg.initialize(new ECGenParameterSpec("secp256r1"), RANDOM);
        return kpg.generateKeyPair();
    }

    private static byte[] uncompressed(ECPublicKey pub) {
        byte[] x = to32(pub.getW().getAffineX());
        byte[] y = to32(pub.getW().getAffineY());
        byte[] out = new byte[65];
        out[0] = 0x04;
        System.arraycopy(x, 0, out, 1, 32);
        System.arraycopy(y, 0, out, 33, 32);
        return out;
    }

    private static byte[] hkdf(byte[] salt, byte[] ikm, byte[] info, int len) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(salt, "HmacSHA256"));
        byte[] prk = mac.doFinal(ikm);
        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        mac.update(info);
        mac.update((byte) 1);
        byte[] okm = mac.doFinal();
        return ArraysCopy(okm, len);
    }

    private static byte[] derToJose(byte[] der) {
        int offset = 2;
        if ((der[1] & 0x80) != 0) offset += der[1] & 0x7f;
        int rLen = der[offset + 1];
        int rStart = offset + 2;
        int sLen = der[rStart + rLen + 1];
        int sStart = rStart + rLen + 2;
        byte[] jose = new byte[64];
        copyFit(der, rStart, rLen, jose, 0, 32);
        copyFit(der, sStart, sLen, jose, 32, 32);
        return jose;
    }

    private static void copyFit(byte[] src, int start, int len, byte[] dest, int destOff, int destLen) {
        while (len > 0 && src[start] == 0) {
            start++;
            len--;
        }
        int pad = destLen - len;
        if (pad < 0) {
            start -= pad;
            len = destLen;
            pad = 0;
        }
        System.arraycopy(src, start, dest, destOff + pad, len);
    }

    private static byte[] to32(BigInteger value) {
        byte[] raw = value.toByteArray();
        if (raw.length == 32) return raw;
        byte[] out = new byte[32];
        if (raw.length > 32) {
            System.arraycopy(raw, raw.length - 32, out, 0, 32);
        } else {
            System.arraycopy(raw, 0, out, 32 - raw.length, raw.length);
        }
        return out;
    }

    private static String originOf(String endpoint) {
        URI uri = URI.create(endpoint);
        int port = uri.getPort();
        String origin = uri.getScheme() + "://" + uri.getHost();
        if (port > 0 && port != 443 && port != 80) origin += ":" + port;
        return origin;
    }

    private static String b64Url(byte[] data) {
        return Base64.encodeToString(data, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static byte[] b64UrlDecode(String value) {
        String padded = value.replace('-', '+').replace('_', '/');
        int mod = padded.length() % 4;
        if (mod > 0) {
            StringBuilder sb = new StringBuilder(padded);
            for (int i = 0; i < 4 - mod; i++) sb.append('=');
            padded = sb.toString();
        }
        return Base64.decode(padded, Base64.DEFAULT);
    }

    private static byte[] concat(byte[]... parts) {
        int n = 0;
        for (byte[] p : parts) n += p.length;
        byte[] out = new byte[n];
        int o = 0;
        for (byte[] p : parts) {
            System.arraycopy(p, 0, out, o, p.length);
            o += p.length;
        }
        return out;
    }

    private static byte[] ArraysCopy(byte[] src, int len) {
        byte[] out = new byte[len];
        System.arraycopy(src, 0, out, 0, len);
        return out;
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }
}
