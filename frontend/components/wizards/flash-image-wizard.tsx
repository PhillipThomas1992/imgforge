"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Download,
  Upload,
  HardDrive,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface StoredImage {
  name: string;
  path: string;
  size_mb: number;
  modified: number;
}

interface Device {
  name: string;
  path: string;
  size: string;
}

interface FlashImageWizardProps {
  onBack: () => void;
  preSelectedImage?: string;
}

export function FlashImageWizard({
  onBack,
  preSelectedImage,
}: FlashImageWizardProps) {
  const [step, setStep] = useState(1);
  const [isFlashing, setIsFlashing] = useState(false);
  const [flashLogs, setFlashLogs] = useState<string[]>([]);
  const [flashStatus, setFlashStatus] = useState<
    "idle" | "flashing" | "success" | "error"
  >("idle");

  // Step 1: Select Image
  const [imageSource, setImageSource] = useState<"stored" | "upload">("stored");
  const [storedImages, setStoredImages] = useState<StoredImage[]>([]);
  const [selectedImage, setSelectedImage] = useState("");
  const [uploadedImagePath, setUploadedImagePath] = useState("");

  // Step 2: Select Device
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  const totalSteps = 3;

  useEffect(() => {
    if (step === 1) {
      loadStoredImages();
    }
  }, [step]);

  useEffect(() => {
    if (preSelectedImage && storedImages.length > 0) {
      setSelectedImage(preSelectedImage);
      setImageSource("stored");
    }
  }, [preSelectedImage, storedImages]);

  const loadStoredImages = async () => {
    try {
      const response = await fetch("/api/images");
      const data = await response.json();
      setStoredImages(data.images || []);
    } catch (error) {
      console.error("Failed to load images:", error);
    }
  };

  const loadDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const response = await fetch("/api/devices");
      const data = await response.json();
      setDevices(data || []);
    } catch (error) {
      console.error("Failed to load devices:", error);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const handleFlash = async () => {
    setIsFlashing(true);
    setFlashStatus("flashing");
    setFlashLogs(["🚀 Starting flash process..."]);

    const imagePath =
      imageSource === "stored" ? selectedImage : uploadedImagePath;

    try {
      const response = await fetch("/api/flash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_path: imagePath,
          device: selectedDevice,
        }),
      });

      if (!response.ok) throw new Error("Flash failed to start");

      const job = await response.json();
      setFlashLogs((prev) => [...prev, `✨ Flash job created: ${job.id}`]);

      const ws = new WebSocket(
        `ws://${window.location.hostname}:3000/api/ws/${job.id}`,
      );

      ws.onmessage = (event) => {
        setFlashLogs((prev) => [...prev, event.data]);
      };

      ws.onclose = () => {
        setFlashStatus("success");
        setIsFlashing(false);
        setFlashLogs((prev) => [...prev, "✅ Flash completed successfully!"]);
      };

      ws.onerror = () => {
        setFlashStatus("error");
        setIsFlashing(false);
        setFlashLogs((prev) => [...prev, "❌ Flash failed"]);
      };
    } catch (error) {
      setFlashStatus("error");
      setIsFlashing(false);
      setFlashLogs((prev) => [...prev, `❌ Error: ${error}`]);
    }
  };

  const canProceed = () => {
    if (step === 1) {
      if (imageSource === "stored") return selectedImage.length > 0;
      if (imageSource === "upload") return uploadedImagePath.length > 0;
    }
    if (step === 2) return selectedDevice.length > 0;
    return true;
  };

  return (
    <div className="min-h-screen relative">
      {/* Header */}
      <header className="relative z-50 border-b border-white/20 backdrop-blur-sm bg-background/40 sticky top-0">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button
              onClick={onBack}
              variant="ghost"
              className="text-blue-200 hover:text-white hover:bg-blue-500/20"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
            <div className="text-sm text-blue-200/70">
              Step {step} of {totalSteps}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl relative z-10">
        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                    s < step
                      ? "bg-blue-500 text-white cosmic-glow-blue"
                      : s === step
                        ? "bg-blue-600 text-white cosmic-glow-blue scale-110"
                        : "bg-blue-900/30 text-blue-400 border border-blue-500/30"
                  }`}
                >
                  {s < step ? <Check className="w-5 h-5" /> : s}
                </div>
                {s < totalSteps && (
                  <div
                    className={`w-20 h-1 mx-2 ${
                      s < step ? "bg-blue-500" : "bg-blue-900/30"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">
              {step === 1 && "Select Image"}
              {step === 2 && "Select Target Device"}
              {step === 3 && "Confirm & Flash"}
            </h2>
            <p className="text-blue-200/70">
              {step === 1 && "Choose the image file to flash"}
              {step === 2 && "Select the SD card or device to flash to"}
              {step === 3 && "Review and start the flashing process"}
            </p>
          </div>
        </div>

        {/* Step Content */}
        <Card className="space-glass-intense border border-blue-500/30 cosmic-shadow-lg">
          <CardContent className="p-8">
            {/* Step 1: Select Image */}
            {step === 1 && (
              <div className="space-y-4">
                <div
                  className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                    imageSource === "stored"
                      ? "border-blue-500 bg-blue-500/10 cosmic-glow-blue"
                      : "border-blue-500/30 hover:border-blue-500/50"
                  }`}
                  onClick={() => setImageSource("stored")}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <Download className="w-6 h-6 text-blue-400" />
                    <h3 className="text-xl font-semibold text-white">
                      Previously Built Images
                    </h3>
                  </div>
                  {imageSource === "stored" &&
                    (storedImages.length > 0 ? (
                      <div className="space-y-2">
                        {storedImages.map((img) => (
                          <div
                            key={img.path}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              selectedImage === img.path
                                ? "border-blue-500 bg-blue-500/10"
                                : "border-blue-500/20 hover:border-blue-500/40"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedImage(img.path);
                            }}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-white font-medium">
                                {img.name}
                              </span>
                              <span className="text-sm text-blue-200/70">
                                {img.size_mb} MB
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-blue-200/50">
                        No images found. Build one first!
                      </p>
                    ))}
                </div>

                <div
                  className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                    imageSource === "upload"
                      ? "border-blue-500 bg-blue-500/10 cosmic-glow-blue"
                      : "border-blue-500/30 hover:border-blue-500/50"
                  }`}
                  onClick={() => setImageSource("upload")}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <Upload className="w-6 h-6 text-blue-400" />
                    <h3 className="text-xl font-semibold text-white">
                      Upload Image File
                    </h3>
                  </div>
                  {imageSource === "upload" && (
                    <div className="space-y-2">
                      <Input
                        type="file"
                        accept=".img,.img.xz,.iso"
                        className="text-white"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setUploadedImagePath(file.name);
                          }
                        }}
                      />
                      <p className="text-xs text-blue-200/50">
                        Supported formats: .img, .img.xz, .iso
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Select Device */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                  <p className="text-sm text-yellow-200">
                    <strong>Warning:</strong> All data on the selected device
                    will be permanently erased!
                  </p>
                </div>

                <Button
                  onClick={loadDevices}
                  disabled={isLoadingDevices}
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500"
                >
                  {isLoadingDevices ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <HardDrive className="w-4 h-4 mr-2" />
                      Scan for Devices
                    </>
                  )}
                </Button>

                {devices.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-white">Available Devices</Label>
                    {devices.map((device) => (
                      <div
                        key={device.path}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedDevice === device.path
                            ? "border-blue-500 bg-blue-500/10 cosmic-glow-blue"
                            : "border-blue-500/30 hover:border-blue-500/50"
                        }`}
                        onClick={() => setSelectedDevice(device.path)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-white font-medium">
                              {device.path}
                            </div>
                            <div className="text-sm text-blue-200/70">
                              {device.name} - {device.size}
                            </div>
                          </div>
                          {selectedDevice === device.path && (
                            <Check className="w-5 h-5 text-blue-400" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!isLoadingDevices && devices.length === 0 && (
                  <p className="text-center text-blue-200/50 py-8">
                    No removable devices found. Click &quot;Scan for
                    Devices&quot; to search.
                  </p>
                )}
              </div>
            )}

            {/* Step 3: Confirm & Flash */}
            {step === 3 && (
              <div className="space-y-6">
                {flashStatus === "idle" && (
                  <>
                    <Card className="bg-blue-500/10 border-blue-500/30">
                      <CardHeader>
                        <CardTitle className="text-white">
                          Flash Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-blue-200/70">Image:</span>
                          <span className="text-white font-medium">
                            {imageSource === "stored"
                              ? storedImages.find(
                                  (i) => i.path === selectedImage,
                                )?.name
                              : uploadedImagePath}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-200/70">
                            Target Device:
                          </span>
                          <span className="text-white font-medium">
                            {selectedDevice}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-red-200">
                          <p className="font-semibold mb-1">Final Warning</p>
                          <p>
                            This will permanently erase all data on{" "}
                            <strong>{selectedDevice}</strong>. This action
                            cannot be undone!
                          </p>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={handleFlash}
                      className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white h-12 text-base"
                    >
                      Start Flashing
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </>
                )}

                {flashStatus === "flashing" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-3 text-blue-200">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-lg font-medium">Flashing...</span>
                    </div>
                    <div className="bg-slate-950/80 text-green-400 p-4 rounded-lg font-mono text-xs h-96 overflow-y-auto border border-blue-500/30">
                      {flashLogs.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                    <p className="text-center text-blue-200/70 text-sm">
                      Do not remove the device or close this window...
                    </p>
                  </div>
                )}

                {flashStatus === "success" && (
                  <div className="text-center space-y-4">
                    <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
                    <h3 className="text-2xl font-bold text-white">
                      Flash Complete!
                    </h3>
                    <p className="text-blue-200/70">
                      Your device is ready to use. You can safely remove it now.
                    </p>
                    <Button onClick={onBack} variant="outline">
                      Back to Home
                    </Button>
                  </div>
                )}

                {flashStatus === "error" && (
                  <div className="text-center space-y-4">
                    <XCircle className="w-16 h-16 text-red-400 mx-auto" />
                    <h3 className="text-2xl font-bold text-white">
                      Flash Failed
                    </h3>
                    <p className="text-blue-200/70">
                      Check the logs above for details
                    </p>
                    <div className="flex gap-4 justify-center">
                      <Button
                        onClick={() => setFlashStatus("idle")}
                        variant="outline"
                      >
                        Try Again
                      </Button>
                      <Button onClick={onBack}>Back to Home</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        {step < 3 && flashStatus === "idle" && (
          <div className="flex justify-between mt-6">
            <Button
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
              variant="outline"
              className="border-blue-500/30"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>
            <Button
              onClick={() => {
                if (step === 2 && devices.length === 0) {
                  loadDevices();
                }
                setStep(step + 1);
              }}
              disabled={!canProceed()}
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
