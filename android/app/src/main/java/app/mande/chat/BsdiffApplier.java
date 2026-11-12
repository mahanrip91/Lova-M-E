package app.mande.chat;

import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;

public final class BsdiffApplier {

    private static final byte[] MAGIC = {
        'B', 'S', 'D', 'I', 'F', 'F', '4', '0'
    };

    private static final int BUFFER_SIZE = 64 * 1024;

    private BsdiffApplier() {}

    public static void apply(
        File oldApk,
        File patchFile,
        File outputApk,
        long expectedNewSize,
        long maxOutputBytes
    ) throws IOException {

        if (oldApk == null || patchFile == null || outputApk == null) {
            throw new IOException("Missing input file");
        }

        if (!oldApk.isFile() || !patchFile.isFile()) {
            throw new IOException("Input file does not exist");
        }

        if (expectedNewSize <= 0 ||
            maxOutputBytes <= 0 ||
            expectedNewSize > maxOutputBytes) {
            throw new IOException("Invalid output size limit");
        }

        File parent = outputApk.getAbsoluteFile().getParentFile();
        if (parent == null || (!parent.exists() && !parent.mkdirs())) {
            throw new IOException("Cannot create output directory");
        }

        boolean success = false;

        try {
            applyInternal(
                oldApk,
                patchFile,
                outputApk,
                expectedNewSize,
                maxOutputBytes
            );
            success = true;
        } finally {
            if (!success && outputApk.exists()) {
                //noinspection ResultOfMethodCallIgnored
                outputApk.delete();
            }
        }
    }

    private static void applyInternal(
        File oldApk,
        File patchFile,
        File outputApk,
        long expectedNewSize,
        long maxOutputBytes
    ) throws IOException {

        try (
            RandomAccessFile oldFile =
                new RandomAccessFile(oldApk, "r");
            RandomAccessFile patch =
                new RandomAccessFile(patchFile, "r")
        ) {
            long oldSize = oldFile.length();
            long patchSize = patch.length();

            if (patchSize < 32) {
                throw new IOException("Patch header is truncated");
            }

            byte[] header = new byte[32];
            patch.readFully(header);

            for (int i = 0; i < MAGIC.length; i++) {
                if (header[i] != MAGIC[i]) {
                    throw new IOException("Invalid BSDIFF40 header");
                }
            }

            long controlLength = readOffset(header, 8);
            long diffLength = readOffset(header, 16);
            long newSize = readOffset(header, 24);

            if (controlLength <= 0 || diffLength <= 0 ||
                newSize <= 0 || newSize > maxOutputBytes ||
                newSize != expectedNewSize) {
                throw new IOException("Invalid BSDIFF40 lengths");
            }

            long controlStart = 32;
            long diffStart = safeAdd(controlStart, controlLength);
            long extraStart = safeAdd(diffStart, diffLength);

            if (extraStart >= patchSize) {
                throw new IOException("Patch blocks are truncated");
            }

            long extraLength = patchSize - extraStart;

            try (
                InputStream controlRaw =
                    new LimitedFileInputStream(
                        patchFile, controlStart, controlLength
                    );
                InputStream diffRaw =
                    new LimitedFileInputStream(
                        patchFile, diffStart, diffLength
                    );
                InputStream extraRaw =
                    new LimitedFileInputStream(
                        patchFile, extraStart, extraLength
                    );

                BZip2CompressorInputStream control =
                    new BZip2CompressorInputStream(
                        controlRaw, false
                    );
                BZip2CompressorInputStream diff =
                    new BZip2CompressorInputStream(
                        diffRaw, false
                    );
                BZip2CompressorInputStream extra =
                    new BZip2CompressorInputStream(
                        extraRaw, false
                    );

                OutputStream output =
                    new BufferedOutputStream(
                        new FileOutputStream(outputApk),
                        BUFFER_SIZE
                    )
            ) {
                long oldPosition = 0;
                long newPosition = 0;

                byte[] diffBuffer = new byte[BUFFER_SIZE];
                byte[] oldBuffer = new byte[BUFFER_SIZE];
                byte[] extraBuffer = new byte[BUFFER_SIZE];

                while (newPosition < newSize) {
                    long addLength = readOffset(control);
                    long copyLength = readOffset(control);
                    long seekAdjustment = readOffset(control);

                    if (addLength < 0 || copyLength < 0 ||
                        (addLength == 0 && copyLength == 0 && seekAdjustment == 0)) {
                        throw new IOException(
                            "Invalid BSDIFF control tuple"
                        );
                    }

                    long afterAdd = safeAdd(newPosition, addLength);
                    long afterCopy = safeAdd(afterAdd, copyLength);

                    if (afterCopy > newSize) {
                        throw new IOException(
                            "Patch exceeds target size"
                        );
                    }

                    long processed = 0;

                    while (processed < addLength) {
                        int count = (int) Math.min(
                            BUFFER_SIZE,
                            addLength - processed
                        );

                        readFully(diff, diffBuffer, count);

                        for (int i = 0; i < count; i++) {
                            oldBuffer[i] = 0;
                        }

                        long oldStart = safeAdd(
                            oldPosition, processed
                        );
                        long oldEnd = safeAdd(oldStart, count);

                        long validStart = Math.max(0, oldStart);
                        long validEnd = Math.min(oldSize, oldEnd);

                        if (validEnd > validStart) {
                            int targetOffset =
                                (int) (validStart - oldStart);
                            int validLength =
                                (int) (validEnd - validStart);

                            oldFile.seek(validStart);
                            oldFile.readFully(
                                oldBuffer,
                                targetOffset,
                                validLength
                            );
                        }

                        for (int i = 0; i < count; i++) {
                            diffBuffer[i] = (byte) (
                                diffBuffer[i] + oldBuffer[i]
                            );
                        }

                        output.write(diffBuffer, 0, count);
                        processed += count;
                    }

                    oldPosition = safeAdd(oldPosition, addLength);
                    newPosition = afterAdd;

                    processed = 0;

                    while (processed < copyLength) {
                        int count = (int) Math.min(
                            BUFFER_SIZE,
                            copyLength - processed
                        );

                        readFully(extra, extraBuffer, count);
                        output.write(extraBuffer, 0, count);

                        processed += count;
                    }

                    newPosition = afterCopy;
                    oldPosition = safeAdd(
                        oldPosition, seekAdjustment
                    );
                }

                output.flush();

                if (control.read() != -1 ||
                    diff.read() != -1 ||
                    extra.read() != -1) {
                    throw new IOException(
                        "Unexpected trailing patch data"
                    );
                }
            }
        }
    }

    private static long readOffset(InputStream input)
        throws IOException {

        byte[] bytes = new byte[8];
        readFully(input, bytes, 8);
        return decodeOffset(bytes, 0);
    }

    private static long readOffset(byte[] bytes, int offset)
        throws IOException {

        return decodeOffset(bytes, offset);
    }

    private static long decodeOffset(byte[] bytes, int offset)
        throws IOException {

        long value = bytes[offset + 7] & 0x7fL;

        for (int i = 6; i >= 0; i--) {
            value = (value << 8) | (bytes[offset + i] & 0xffL);
        }

        if ((bytes[offset + 7] & 0x80) != 0) {
            value = -value;
        }

        return value;
    }

    private static void readFully(
        InputStream input,
        byte[] buffer,
        int length
    ) throws IOException {

        int offset = 0;

        while (offset < length) {
            int count = input.read(
                buffer, offset, length - offset
            );

            if (count < 0) {
                throw new IOException("Unexpected end of patch block");
            }

            if (count == 0) {
                continue;
            }

            offset += count;
        }
    }

    private static long safeAdd(long a, long b)
        throws IOException {

        if (b > 0 && a > Long.MAX_VALUE - b) {
            throw new IOException("Integer overflow");
        }

        if (b < 0 && a < Long.MIN_VALUE - b) {
            throw new IOException("Integer underflow");
        }

        return a + b;
    }

    private static final class LimitedFileInputStream
        extends InputStream {

        private final RandomAccessFile file;
        private long remaining;

        LimitedFileInputStream(
            File source,
            long start,
            long length
        ) throws IOException {

            if (start < 0 || length < 0) {
                throw new IOException("Invalid patch block range");
            }

            file = new RandomAccessFile(source, "r");

            if (start > file.length() ||
                length > file.length() - start) {
                file.close();
                throw new IOException("Patch block outside file");
            }

            file.seek(start);
            remaining = length;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) {
                return -1;
            }

            int value = file.read();

            if (value >= 0) {
                remaining--;
            }

            return value;
        }

        @Override
        public int read(
            byte[] buffer,
            int offset,
            int length
        ) throws IOException {

            if (length == 0) {
                return 0;
            }

            if (remaining <= 0) {
                return -1;
            }

            int count = (int) Math.min(remaining, length);
            int result = file.read(buffer, offset, count);

            if (result > 0) {
                remaining -= result;
            }

            return result;
        }

        @Override
        public void close() throws IOException {
            file.close();
        }
    }
}
