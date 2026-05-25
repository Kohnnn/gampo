// vite.config.js
import { defineConfig } from "file:///D:/gampo/node_modules/vite/dist/node/index.js";
import react from "file:///D:/gampo/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
var __vite_injected_original_dirname = "D:\\gampo";
var vite_config_default = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["vdklbvkzbd1g.share.zrok.io"],
    port: 5173,
    open: false,
    watch: {
      ignored: ["**/example/**"]
    }
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "phaser": ["phaser"],
          "matter": ["matter-js"],
          "chart": ["chart.js"]
        }
      }
    }
  },
  test: {
    include: ["src/**/*.test.{js,jsx,ts,tsx}"],
    environment: "node"
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxnYW1wb1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRDpcXFxcZ2FtcG9cXFxcdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L2dhbXBvL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcclxuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xyXG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiXHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gICAgcGx1Z2luczogW3JlYWN0KCldLFxyXG4gICAgcmVzb2x2ZToge1xyXG4gICAgICAgIGFsaWFzOiB7XHJcbiAgICAgICAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjXCIpLFxyXG4gICAgICAgIH0sXHJcbiAgICB9LFxyXG4gICAgc2VydmVyOiB7XG4gICAgICAgIGhvc3Q6ICcwLjAuMC4wJyxcbiAgICAgICAgYWxsb3dlZEhvc3RzOiBbJ3Zka2xidmt6YmQxZy5zaGFyZS56cm9rLmlvJ10sXG4gICAgICAgIHBvcnQ6IDUxNzMsXG4gICAgICAgIG9wZW46IGZhbHNlLFxyXG4gICAgICAgIHdhdGNoOiB7XHJcbiAgICAgICAgICAgIGlnbm9yZWQ6IFsnKiovZXhhbXBsZS8qKiddLFxyXG4gICAgICAgIH0sXHJcbiAgICB9LFxyXG4gICAgYnVpbGQ6IHtcclxuICAgICAgICBvdXREaXI6ICdkaXN0JyxcclxuICAgICAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDE1MDAsXHJcbiAgICAgICAgcm9sbHVwT3B0aW9uczoge1xyXG4gICAgICAgICAgICBvdXRwdXQ6IHtcclxuICAgICAgICAgICAgICAgIG1hbnVhbENodW5rczoge1xyXG4gICAgICAgICAgICAgICAgICAgICdyZWFjdC12ZW5kb3InOiBbJ3JlYWN0JywgJ3JlYWN0LWRvbScsICdyZWFjdC1yb3V0ZXItZG9tJ10sXHJcbiAgICAgICAgICAgICAgICAgICAgJ3BoYXNlcic6IFsncGhhc2VyJ10sXHJcbiAgICAgICAgICAgICAgICAgICAgJ21hdHRlcic6IFsnbWF0dGVyLWpzJ10sXHJcbiAgICAgICAgICAgICAgICAgICAgJ2NoYXJ0JzogWydjaGFydC5qcyddLFxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgfSxcclxuICAgIHRlc3Q6IHtcclxuICAgICAgICBpbmNsdWRlOiBbJ3NyYy8qKi8qLnRlc3Que2pzLGpzeCx0cyx0c3h9J10sXHJcbiAgICAgICAgZW52aXJvbm1lbnQ6ICdub2RlJ1xyXG4gICAgfVxyXG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE4TSxTQUFTLG9CQUFvQjtBQUMzTyxPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBRmpCLElBQU0sbUNBQW1DO0FBSXpDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQ3hCLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxFQUNqQixTQUFTO0FBQUEsSUFDTCxPQUFPO0FBQUEsTUFDSCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDeEM7QUFBQSxFQUNKO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDSixNQUFNO0FBQUEsSUFDTixjQUFjLENBQUMsNEJBQTRCO0FBQUEsSUFDM0MsTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0gsU0FBUyxDQUFDLGVBQWU7QUFBQSxJQUM3QjtBQUFBLEVBQ0o7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNILFFBQVE7QUFBQSxJQUNSLHVCQUF1QjtBQUFBLElBQ3ZCLGVBQWU7QUFBQSxNQUNYLFFBQVE7QUFBQSxRQUNKLGNBQWM7QUFBQSxVQUNWLGdCQUFnQixDQUFDLFNBQVMsYUFBYSxrQkFBa0I7QUFBQSxVQUN6RCxVQUFVLENBQUMsUUFBUTtBQUFBLFVBQ25CLFVBQVUsQ0FBQyxXQUFXO0FBQUEsVUFDdEIsU0FBUyxDQUFDLFVBQVU7QUFBQSxRQUN4QjtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUFBLEVBQ0EsTUFBTTtBQUFBLElBQ0YsU0FBUyxDQUFDLCtCQUErQjtBQUFBLElBQ3pDLGFBQWE7QUFBQSxFQUNqQjtBQUNKLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
