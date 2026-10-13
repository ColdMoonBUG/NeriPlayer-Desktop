#define main upstream_regressions_main
#include "neri_dsp_engine_test.cpp"
#undef main

#include <new>

namespace {
thread_local bool trackingAllocations = false;
thread_local size_t allocationCount = 0;
}

void* operator new(size_t bytes) {
    if (trackingAllocations) ++allocationCount;
    if (void* memory = std::malloc(bytes == 0 ? 1 : bytes)) return memory;
    throw std::bad_alloc();
}

void* operator new[](size_t bytes) { return ::operator new(bytes); }
void operator delete(void* memory) noexcept { std::free(memory); }
void operator delete[](void* memory) noexcept { std::free(memory); }
void operator delete(void* memory, size_t) noexcept { std::free(memory); }
void operator delete[](void* memory, size_t) noexcept { std::free(memory); }

extern "C" {
void* neri_desktop_dsp_create(int32_t rate, int32_t channels, const float* neutral) noexcept;
void neri_desktop_dsp_destroy(void* pointer) noexcept;
int32_t neri_desktop_dsp_set_params(void* pointer, const float* params, int32_t count) noexcept;
int32_t neri_desktop_dsp_process(void* pointer, float* samples, size_t count) noexcept;
}

int main() {
    auto params = neutralParams();
    params[kMasterEnabled] = 0.0f;
    void* desktop = neri_desktop_dsp_create(kSampleRate, 2, params.data());
    if (!desktop) return 1;
    std::array<float, 960> samples{};
    bool valid = true;
    trackingAllocations = true;
    for (int iteration = 0; iteration < 300; ++iteration) {
        params[kQualityMode] = static_cast<float>(iteration % 3);
        params[kMasterEnabled] = iteration % 7 == 0 ? 0.0f : 1.0f;
        params[kGraphicEqEnabled] = 1.0f;
        params[kGraphicEqGain0 + 5] = static_cast<float>(iteration % 12);
        params[kWarmthAmount] = 0.8f;
        params[kSurroundAmount] = 0.8f;
        params[kReverbAmount] = 0.8f;
        params[kReverbPreDelayMs] = static_cast<float>(iteration % 100);
        params[kSpeakerEnabled] = 1.0f;
        params[kCompressorEnabled] = 1.0f;
        params[kLimiterEnabled] = 1.0f;
        for (size_t i = 0; i < samples.size(); ++i) samples[i] = 0.2f * std::sin(static_cast<float>(i));
        valid = neri_desktop_dsp_set_params(desktop, params.data(), kParamCount) != 0 && valid;
        valid = neri_desktop_dsp_process(desktop, samples.data(), samples.size()) >= 0 && valid;
        for (float sample : samples) valid = std::isfinite(sample) && valid;
    }
    trackingAllocations = false;
    neri_desktop_dsp_destroy(desktop);
    std::printf("desktop realtime DSP: %zu allocations, valid=%d, 300 updates across all quality modes\n",
        allocationCount, valid ? 1 : 0);
    return valid && allocationCount == 0 ? 0 : 1;
}
