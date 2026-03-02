import React from "react";
import {Alert, Box, Button, Card, CardContent, Stack, Typography} from "@mui/material";

interface Props {
    pageName: string;
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    message: string;
}

export default class PageErrorBoundary extends React.Component<Props, State> {
    override state: State = {
        hasError: false,
        message: "",
    };

    static getDerivedStateFromError(error: unknown): State {
        const message = error instanceof Error ? error.message : String(error);
        return {hasError: true, message};
    }

    override componentDidCatch(error: unknown) {
        console.error(`Error rendering page "${this.props.pageName}"`, error);
    }

    private retry = () => {
        this.setState({hasError: false, message: ""});
    };

    override render() {
        if (!this.state.hasError) return this.props.children;
        return (
            <Box sx={{p: 2}}>
                <Card>
                    <CardContent>
                        <Stack spacing={2}>
                            <Typography variant="h5">Failed to load page</Typography>
                            <Alert severity="error">{this.state.message || "Unknown error"}</Alert>
                            <Button variant="contained" onClick={this.retry} sx={{alignSelf: "flex-start"}}>
                                Try Again
                            </Button>
                        </Stack>
                    </CardContent>
                </Card>
            </Box>
        );
    }
}
