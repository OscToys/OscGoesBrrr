import {Fragment, LegacyRef, type ReactNode, useEffect, useRef, useState} from 'react';
import {ipcRenderer} from "electron";
import {Config, Rule} from '../../common/configTypes';
import React from 'react';
import {
    type FieldPath,
    type FieldArrayPath,
    FormProvider,
    useFieldArray,
    useForm,
    useFormContext,
    type FieldPathByValue,
    type FieldValues,
    type FieldArray, Controller
} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {ErrorMessage} from "@hookform/error-message";
import {
    DropdownButton,
    Dropdown,
    Button,
    Badge,
    Toast,
    ToastContainer,
    ListGroup,
    ListGroupItem, Card, InputGroup, FormCheck, Row
} from "react-bootstrap";
import {DragDropContext, Droppable, Draggable, DropResult, ResponderProvided} from "react-beautiful-dnd";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faBars, faCross, faXmark} from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import FormCheckLabel from "react-bootstrap/FormCheckLabel";
import FormCheckInput from "react-bootstrap/FormCheckInput";

export default function Settings() {
    const [loadError, setLoadError] = useState('');
    const form = useForm({
        resolver: zodResolver(Config),
        defaultValues: async () => {
            try {
                return await Config.parseAsync(await ipcRenderer.invoke('config:get'));
            } catch(e) {
                setLoadError(e instanceof Error ? e.message : e+'');
                throw e;
            }
        }
    });
    const {
        control,
        reset,
        register,
        setValue,
        resetField,
        handleSubmit,
        getValues,
        formState: { errors, isValid, isDirty, isSubmitting, dirtyFields, isLoading }
    } = form;
    const { append: appendRule } = useFieldArray({ control: control, name: "rules", });
    const onSubmit = handleSubmit(
        async data => {
            console.log("submit", data);
            await ipcRenderer.invoke('config:set', data);
            reset(data);
        }
    );

    if (loadError) return <>{loadError}</>;
    if (isLoading) return <>Loading configuration ...</>;

    return <FormProvider {...form}><form onSubmit={onSubmit} className="settings"><fieldset disabled={isSubmitting}>
        <div className="sectionHeader">Intiface</div>
        <div>Intiface Server Port or IP:Port</div>
        <Field name="outputs.intiface.address" placeholder="12345" />

        <div className="sectionHeader">VRChat</div>

        <Field name="sources.vrchat.allowSelfTouch" mode="check" checkLabel="Allow Hand Touch from self"/>
        <Field name="sources.vrchat.allowSelfPlug" mode="check" checkLabel="Allow Plug/Socket interaction from self"/>

        <FieldArray title="Forward OSC Data to another application" name="sources.vrchat.proxy" appendText="Add Proxy Port" flush={true} className="mt-4">{name =>
            <Field name={`${name}.address`} placeholder="Example: 9002 or 192.168.0.5:9000" style={{border: 0}}/>
        }</FieldArray>

        <FieldArray title="Use custom avatar parameters as sources" name="sources.vrchat.customSourceParams" appendText="Add Level Parameter" className="mt-4">{name =>
            <>
                <div style={{display:'flex', flexDirection:'row', alignItems:'center'}}>
                    <div style={{width:"150px", flexShrink:0}}>Parameter Name</div>
                    <Field name={`${name}.name`}/>
                </div>
                <div style={{display:'flex', flexDirection:'row', alignItems:'center'}}>
                    <div style={{width:"150px", flexShrink:0}}>Limit to Output Tags</div>
                    <Field name={`${name}.name`} placeholder="All"/>
                </div>
            </>
        }</FieldArray>

        <div className="sectionHeader">Advanced Rules</div>
        <FieldArray name="rules" appendText="Add Rule" appendOptions={[
            ["Multiply Intensity", {action: {type: "scale", scale: 1}}],
            ["Vibrate based on movement", {action: {type: "movement"}}],
        ]}>
            {name => <RuleEditor name={name}/>}
        </FieldArray>

        <ToastContainer position="bottom-center"><Toast style={{width:'auto'}} show={isDirty}>
            <Toast.Body>You have unsaved changes <Button as="input" type="submit" variant="success" value="Save" /></Toast.Body>
        </Toast></ToastContainer>
        {Object.keys(errors).length > 0 && <span style={{whiteSpace: 'pre-wrap'}}>
            Error:
        </span>}

    </fieldset></form></FormProvider>;
}

function RuleEditor({name}: {name: FieldPathByValue<Config, Rule>}) {
    const {register, getValues} = useFormContext<Config>();
    const type = getValues(`${name}.action.type`);

    let body;
    if (type == "scale") {
        body = <div className="conditions">
            <div style={{display:'flex', flexDirection:'row', alignItems:'center'}}>
                <div style={{flexShrink:0, paddingRight:5}}>Multiply intensity by</div>
                <Field style={{width:80}} name={`${name}.action.scale`} mode="number" type="number" step="any" min="0"/>
            </div>
        </div>;
    } else if (type == "movement") {
        body = <>Vibrate based on movement, rather than depth</>;
    }
    return <>
        <ConditionsEditor rulePath={name}/>
        {body}
    </>;
}

function ConditionsEditor({rulePath}: {rulePath: FieldPathByValue<Config, Rule>}) {
    const [loadedTags, setLoadedTags] = useState<string[]>();
    const conditionPath: FieldPathByValue<Config, string> = `${rulePath}.condition`;
    const {setValue,getValues} = useFormContext<Config>();
    function addTag(tag: string) {
        let value = getValues(conditionPath);
        if (value == undefined) value = '';
        if (value != '' && !value.endsWith(' ') && !value.endsWith('-')) value += ' ';
        value += tag;
        setValue(conditionPath, value, { shouldDirty: true });
    }
    let conditions = <InputGroup>
        <Field name={conditionPath} placeholder="Always"/>
        <DropdownButton variant="outline-primary" title="Select Tag" onToggle={async (nextShow) => {
            if (nextShow) {
                setLoadedTags(await ipcRenderer.invoke("tags:get"));
            } else {
                setLoadedTags(undefined);
            }
        }}>
            {loadedTags && loadedTags.map(tag =>
                <Dropdown.Item key={tag} onClick={_ => addTag(tag)}>{tag}</Dropdown.Item>
            )}
        </DropdownButton>
    </InputGroup>;
    return <div className="conditions">
        <div style={{display:'flex', flexDirection:'row', alignItems:'center'}}>
            <div style={{flexShrink:0, paddingRight:5}}>When</div>
            {conditions}
        </div>
    </div>;
}

function Field({name, placeholder, mode, checkLabel, ...rest}: {
    name: FieldPath<Config>,
    placeholder?: string,
    mode?: 'check' | 'number'
    checkLabel?: React.ReactNode
} & React.ComponentProps<"input">) {
    const {register, setValue, getValues, formState: { errors }} = useFormContext<Config>();
    let input;
    if (mode == 'check') {
        input = <FormCheck
            id={`form_${name}`}
            defaultChecked={!!getValues(name)}
            onChange={e => {
                console.log("NEW VALUE", name, e.target.checked);
                setValue(name, e.target.checked, { shouldDirty: true })
            }}
            label={checkLabel}
        />;
    } else if (mode == 'number') {
        input = <input {...register(name, { valueAsNumber: true })} placeholder={placeholder} className="form-control" {...rest} />;
    } else {
        input = <input {...register(name)} placeholder={placeholder} className="form-control" {...rest} />;
    }
    return <>
        {input}
        <ErrorMessage
            errors={errors}
            name={name}
            render={({ message }) => <div className="error">{message}</div>}
        />
    </>;
}

function FieldArray<P extends FieldArrayPath<Config>>({name, title, flush, children, appendOptions, appendText, appendObject, emptyElement, allowReordering, className}: {
    name: P,
    title?: string,
    flush?: boolean,
    children: (path: `${P}.${number}`) => ReactNode,
    appendOptions?: [string,any][],
    appendText?: string,
    appendObject?: any,
    emptyElement?: ReactNode,
    allowReordering?: boolean,
    className?: string
}) {
    const {control} = useFormContext<Config>();
    const {
        fields,
        append,
        move,
        remove
    } = useFieldArray({
        control: control,
        name: name,
    });
    if (!appendText) appendText = "Add";

    let addButton;
    if (appendOptions) {
        addButton = <DropdownButton variant="outline-primary" title={appendText}>
            {appendOptions.map(([name,obj]) => <Dropdown.Item key={name} onClick={_ => append(obj)}>{name}</Dropdown.Item>)}
        </DropdownButton>
    } else {
        addButton = <Button variant="outline-primary" onClick={_ => append(appendObject ?? {})}>{appendText}</Button>
    }

    function onDragEnd(result: DropResult, provided: ResponderProvided) {
        console.log(result, provided);
        if (!result.destination) {
            return;
        }
        move(result.source.index, result.destination.index);
    }

    return <>
        <Card className={className}>
        <ListGroup variant="flush">
            {title && <ListGroup.Item className="title">{title}</ListGroup.Item>}
            {fields.length == 0 && emptyElement && <ListGroup.Item>{emptyElement}</ListGroup.Item>}
            <ListGroup.Item>
            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="droppable">
                    {(provided, snapshot) => (
                        <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                        >
                            {fields.map((field, index) =>
                                <Draggable key={field.id} draggableId={field.id} index={index}>
                                    {(provided, snapshot) => (
                                        <ListGroup.Item key={field.id} ref={provided.innerRef} {...provided.draggableProps}>
                                            <div className={classNames("main", {"flush": flush})}>
                                                <div className="handle" {...provided.dragHandleProps}>
                                                    <FontAwesomeIcon icon={faBars}/>
                                                </div>
                                                <div className="body">
                                                    {children(`${name}.${index}`)}
                                                </div>
                                                <FontAwesomeIcon icon={faXmark} className="remove" onClick={() => remove(index)}/>
                                            </div>
                                        </ListGroup.Item>
                                    )}
                                </Draggable>
                            )}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
            </ListGroup.Item>
            {addButton}
        </ListGroup>
        </Card>
    </>;

}
