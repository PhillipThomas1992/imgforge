"use client";

import { useState, useEffect } from "react";
import AnimatedContent from "@/components/AnimatedContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Wifi,
  Lock,
  User,
  Code,
  Loader2,
  Download,
  Upload,
  Cpu,
  Terminal,
  CheckCircle2,
  XCircle,
} from "lucide-react";

type BoardType = "raspberrypi" | "jetson" | "radxa";
type PresetImage = "raspberrypi_lite" | "radxa_desktop" | "radxa_server";

interface StoredImage {
  name: string;
  path: string;
  size_mb: number;
  modified: number;
}

export function CreateImageWizard() {
  const [step, setStep] = useState(1);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [buildStatus, setBuildStatus] = useState<
    "idle" | "building" | "success" | "error"
  >("idle");

  const [imageSource, setImageSource] = useState<
    "preset" | "custom" | "stored"
  >("preset");
  const [presetImage, setPresetImage] =
    useState<PresetImage>("raspberrypi_lite");
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [storedImages, setStoredImages] = useState<StoredImage[]>([]);
  const [selectedStoredImage, setSelectedStoredImage] = useState("");

  const [boardType, setBoardType] = useState<BoardType>("raspberrypi");
  const [hostname, setHostname] = useState("my-device");
  const [changeUsername, setChangeUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [enableRootPassword, setEnableRootPassword] = useState(false);
  const [rootPassword, setRootPassword] = useState("");
  const [enableSSH, setEnableSSH] = useState(true);

  const [wifiEnabled, setWifiEnabled] = useState(false);
  const [wifiSSID, setWifiSSID] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [expandImage, setExpandImage] = useState(true);
  const [extraSize, setExtraSize] = useState("+2G");

  const [dockerComposeEnabled, setDockerComposeEnabled] = useState(false);
  const [dockerComposeContent, setDockerComposeContent] = useState("");
  const [customScriptEnabled, setCustomScriptEnabled] = useState(false);
  const [customScriptContent, setCustomScriptContent] = useState("");

  const [wifiSSIDs, setWifiSSIDs] = useState<string[]>([]);

  useEffect(() => {
    if (step === 4) {
      fetch("http://localhost:3001/api/wifi-devices")
        .then((res) => res.json())
        .then((data) => {
          // Expecting an array like ["Network_1", "Network_2", ...]
          setWifiSSIDs(data);
        })
        .catch((err) => console.error("Failed to fetch Wi-Fi SSIDs:", err));
    }
  }, [step]);

  const totalSteps = 6;

  useEffect(() => {
    if (step === 1) loadStoredImages();
  }, [step]);

  const loadStoredImages = async () => {
    try {
      const response = await fetch("/api/images");
      const data = await response.json();
      setStoredImages(data.images || []);
    } catch {
      console.error("Failed to load images");
    }
  };

  const canProceed = () => {
    if (step === 1) return true;
    if (step === 2) {
      if (imageSource === "preset") return true;
      if (imageSource === "custom") return customImageUrl.length > 0;
      if (imageSource === "stored") return selectedStoredImage.length > 0;
    }
    if (step === 3) return hostname.length > 0;
    return true;
  };

  return (
    <div className="min-h-screen relative container mx-auto px-4 py-8 max-w-4xl">
      {/* Progress indicator */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                  s < step
                    ? "bg-orange-500 text-white cosmic-glow"
                    : s === step
                      ? "bg-orange-600 text-white cosmic-glow scale-110"
                      : "bg-orange-900/30 text-orange-400 border border-orange-500/30"
                }`}
              >
                {s < step ? <Check className="w-5 h-5" /> : s}
              </div>
              {s < totalSteps && (
                <div
                  className={`w-12 h-1 mx-2 ${
                    s < step ? "bg-orange-500" : "bg-orange-900/30"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">
            {step === 1 && "Choose Board Type"}
            {step === 2 && "Select Image Source"}
            {step === 3 && "Basic Configuration"}
            {step === 4 && "Network & Storage"}
            {step === 5 && "Advanced Options"}
            {step === 6 && "Review & Build"}
          </h2>
        </div>
      </div>

      {/* Animated step content */}
      <AnimatedContent
        key={step}
        onComplete={() => {}}
        distance={420}
        delay={0}
        direction="horizontal"
        duration={0.9}
        ease="power2.out"
        initialOpacity={0.2}
        animateOpacity
        scale={1.0}
        threshold={0.2}
      >
        <Card className="bg-background/40 backdrop-blur-md border border-orange-500/30 cosmic-shadow-lg">
          <CardContent className="p-8">
            {step === 1 && (
              <div className="flex flex-col gap-4">
                {["raspberrypi", "radxa", "jetson"].map((b) => (
                  <div
                    key={b}
                    className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                      boardType === b
                        ? "border-orange-500 bg-orange-500/10 cosmic-glow"
                        : "border-orange-500/30 hover:border-orange-500/50"
                    }`}
                    onClick={() => {
                      setBoardType(b as BoardType);
                      setStep(2);
                    }}
                  >
                    <Cpu className="w-12 h-12 text-orange-400 mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2 capitalize">
                      {b === "raspberrypi"
                        ? "Raspberry Pi / Generic"
                        : b === "radxa"
                          ? "Radxa Boards"
                          : "NVIDIA Jetson"}
                    </h3>
                    <p className="text-sm text-orange-200/70">
                      {b === "raspberrypi"
                        ? "For Raspberry Pi and .img-based boards"
                        : b === "radxa"
                          ? "Radxa boards requiring bootloader flash"
                          : "Jetson devices via flash.sh"}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div
                  className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                    imageSource === "preset"
                      ? "border-orange-500 bg-background/40 cosmic-glow"
                      : "border-orange-500/30 hover:border-orange-500/50"
                  }`}
                  onClick={() => setImageSource("preset")}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <Download className="w-6 h-6 text-orange-400" />
                    <h3 className="text-xl font-semibold text-white">
                      Preset Images
                    </h3>
                  </div>
                  {imageSource === "preset" && (
                    <Select
                      value={presetImage}
                      onValueChange={(v) => setPresetImage(v as PresetImage)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select preset image" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="raspberrypi_lite">
                          Raspberry Pi OS Lite (64-bit)
                        </SelectItem>
                        <SelectItem value="radxa_desktop">
                          Radxa Zero3W Ubuntu 22.04 Desktop
                        </SelectItem>
                        <SelectItem value="radxa_server">
                          Radxa Zero3W Ubuntu 22.04 Server
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div
                  className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                    imageSource === "custom"
                      ? "border-orange-500 bg-background/40 cosmic-glow"
                      : "border-orange-500/30 hover:border-orange-500/50"
                  }`}
                  onClick={() => setImageSource("custom")}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <Upload className="w-6 h-6 text-orange-400" />
                    <h3 className="text-xl font-semibold text-white">
                      Custom Image URL
                    </h3>
                  </div>
                  {imageSource === "custom" && (
                    <Input
                      placeholder="https://example.com/image.img"
                      value={customImageUrl}
                      onChange={(e) => setCustomImageUrl(e.target.value)}
                    />
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <Label className="text-white mb-2 flex items-center gap-2">
                    <Cpu className="w-4 h-4" />
                    Hostname
                  </Label>
                  <Input
                    placeholder="my-device"
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border border-orange-500/30 bg-orange-500/5">
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-orange-400" />
                    <Label className="text-white">
                      Change Default Username
                    </Label>
                  </div>
                  <Switch
                    checked={changeUsername}
                    onCheckedChange={setChangeUsername}
                  />
                </div>

                {changeUsername && (
                  <Input
                    placeholder="New username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                  />
                )}

                <div className="flex items-center justify-between p-4 rounded-lg border border-orange-500/30 bg-orange-500/5">
                  <div className="flex items-center gap-3">
                    <Lock className="w-5 h-5 text-orange-400" />
                    <Label className="text-white">Set Root Password</Label>
                  </div>
                  <Switch
                    checked={enableRootPassword}
                    onCheckedChange={setEnableRootPassword}
                  />
                </div>

                {enableRootPassword && (
                  <Input
                    type="password"
                    placeholder="Root password"
                    value={rootPassword}
                    onChange={(e) => setRootPassword(e.target.value)}
                  />
                )}

                <div className="flex items-center justify-between p-4 rounded-lg border border-orange-500/30 bg-orange-500/5">
                  <div className="flex items-center gap-3">
                    <Terminal className="w-5 h-5 text-orange-400" />
                    <Label className="text-white">Enable SSH</Label>
                  </div>
                  <Switch checked={enableSSH} onCheckedChange={setEnableSSH} />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border border-orange-500/30 bg-orange-500/5">
                  <div>
                    <Label className="text-white">Expand Image Size</Label>
                    <p className="text-sm text-orange-200/70">
                      Add extra space for packages
                    </p>
                  </div>
                  <Switch
                    checked={expandImage}
                    onCheckedChange={setExpandImage}
                  />
                </div>

                {expandImage && (
                  <Select value={extraSize} onValueChange={setExtraSize}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="+1G">+1 GB</SelectItem>
                      <SelectItem value="+2G">+2 GB</SelectItem>
                      <SelectItem value="+4G">+4 GB</SelectItem>
                      <SelectItem value="+8G">+8 GB</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                {/* Wi-Fi Configuration */}
                <div className="flex items-center justify-between p-4 rounded-lg border border-orange-500/30 bg-orange-500/5">
                  <div className="flex items-center gap-3">
                    <Wifi className="w-5 h-5 text-orange-400" />
                    <div>
                      <Label className="text-white">Configure Wi-Fi</Label>
                      <p className="text-sm text-orange-200/70">
                        Headless Wi-Fi setup
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={wifiEnabled}
                    onCheckedChange={setWifiEnabled}
                  />
                </div>

                {wifiEnabled && (
                  <Tabs defaultValue="select" className="w-full">
                    <TabsList className="w-full">
                      <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                      <TabsTrigger value="select">
                        Select from SSIDs
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="manual" className="mt-4 space-y-4">
                      <div>
                        <Label className="text-white mb-2">Wi-Fi SSID</Label>
                        <Input
                          placeholder="MyWiFiNetwork"
                          value={wifiSSID}
                          onChange={(e) => setWifiSSID(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-white mb-2">
                          Wi-Fi Password
                        </Label>
                        <Input
                          type="password"
                          placeholder="Password"
                          value={wifiPassword}
                          onChange={(e) => setWifiPassword(e.target.value)}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="select" className="mt-4">
                      <div>
                        <Label className="text-white mb-2">
                          Available Wi-Fi Networks
                        </Label>
                        <div
                          className="overflow-y-auto border border-orange-500/30 rounded-lg bg-background/40"
                          style={{ maxHeight: "30vh" }}
                        >
                          {wifiSSIDs.length > 0 ? (
                            wifiSSIDs.map((ssid, index) => (
                              <div
                                key={index}
                                className={`p-2 cursor-pointer ${
                                  ssid === wifiSSID
                                    ? "bg-orange-500 text-white"
                                    : "hover:bg-orange-500/20 text-orange-200"
                                }`}
                                onClick={() => setWifiSSID(ssid)}
                              >
                                {ssid}
                              </div>
                            ))
                          ) : (
                            <div className="p-3 text-orange-200/60">
                              Scanning for networks…
                            </div>
                          )}
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </AnimatedContent>

      {/* Navigation buttons */}
      {step < 6 && (
        <div className="flex justify-between mt-6">
          <Button
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
            variant="outline"
            className="border-orange-500/30 text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
